'use strict';
'require view';
'require form';
'require fs';
'require rpc';
'require ui';
'require uci';

const wedRuntimeStatusId = 'advanced-wed-runtime-status';
const wedApplyStatusId = 'advanced-wed-apply-status';
const wedRebootButtonId = 'advanced-wed-reboot-button';

let currentWedConfigValue = '0';
let currentWedFormValue = '0';
let currentWedRuntimeEnabled = false;

const callGetWED = rpc.declare({
	object: 'luci',
	method: 'getWED',
	params: [ 'enabled' ],
	expect: { enabled: false }
});

const callReboot = rpc.declare({
	object: 'system',
	method: 'reboot',
	expect: { result: 0 }
});

function wedNeedsReboot(configValue, runtimeEnabled) {
	return ((configValue === '1') !== (runtimeEnabled === true));
}

function formatWedRuntimeStatus(enabled) {
	return 'getWED: enabled=%s (%s)'.format(
		enabled ? 'true' : 'false',
		enabled ? _('On') : _('Off'));
}

function setWedRuntimeStatus(text) {
	const node = document.getElementById(wedRuntimeStatusId);

	if (node)
		node.textContent = text;
}

function formatWedApplyStatus(configValue, runtimeEnabled) {
	if (currentWedFormValue !== currentWedConfigValue)
		return _('Save & Apply is required');

	return wedNeedsReboot(configValue, runtimeEnabled)
		? _('Reboot is required')
		: _('Applied');
}

function setWedApplyStatus() {
	const node = document.getElementById(wedApplyStatusId);
	const rebootAllowed = currentWedFormValue === currentWedConfigValue;

	if (node)
		node.textContent = formatWedApplyStatus(currentWedConfigValue, currentWedRuntimeEnabled);

	const rebootButton = document.getElementById(wedRebootButtonId);

	if (rebootButton)
		rebootButton.style.display = rebootAllowed &&
			wedNeedsReboot(currentWedConfigValue, currentWedRuntimeEnabled) ? '' : 'none';
}

function refreshWedRuntimeStatus() {
	setWedRuntimeStatus(_('getWED: reading...'));

	return callGetWED().then(function(enabled) {
		currentWedRuntimeEnabled = enabled === true;
		setWedRuntimeStatus(formatWedRuntimeStatus(currentWedRuntimeEnabled));
		setWedApplyStatus();

		return currentWedRuntimeEnabled;
	}).catch(function(err) {
		setWedRuntimeStatus(_('getWED: unable to read runtime setting'));
	});
}

function handleWedReboot(ev) {
	if (ev)
		ev.preventDefault();

	return callReboot().then(function(res) {
		if (res != 0) {
			ui.addNotification(null, E('p', _('The reboot command failed with code %d').format(res)));
			L.raise('Error', 'Reboot failed');
		}

		ui.showModal(_('Rebooting...'), [
			E('p', { 'class': 'spinning' }, _('Waiting for device...'))
		]);

		window.setTimeout(function() {
			ui.showModal(_('Rebooting...'), [
				E('p', { 'class': 'spinning alert-message warning' },
					_('Device unreachable! Still waiting for device...'))
			]);
		}, 150000);

		ui.awaitReconnect();
	}).catch(function(e) {
		ui.addNotification(null, E('p', e.message));
	});
}

function reloadWedAfterApply() {
	const onApplied = function() {
		document.removeEventListener('uci-applied', onApplied);

		fs.exec('/etc/init.d/advanced_setup', [ 'reload', 'wed' ])
			.then(refreshWedRuntimeStatus)
			.catch(function(err) {
				setWedRuntimeStatus(_('getWED: unable to refresh runtime setting'));
				ui.addNotification(null, E('p', err.message));
			});
	};

	document.addEventListener('uci-applied', onApplied);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('advanced'),
			L.resolveDefault(callGetWED(), false)
		]);
	},

	render: function(data) {
		currentWedRuntimeEnabled = data[1] === true;
		currentWedConfigValue = '0';
		currentWedFormValue = '0';
		let m = new form.Map('advanced');

		if (L.hasSystemFeature('wedoffload')) {
			let s = m.section(form.TypedSection, 'defaults', _('WED Offloading'),
				_('Wireless Ethernet Dispatch (WED) offloads part of the Wi-Fi data path in hardware. This can reduce CPU usage and improve routing throughput for wireless clients. Changes are applied on the next reboot.'));
			let o;

			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.ListValue, 'wed_offloading', _('Enable WED'));
			o.value('0', _('Off'));
			o.value('1', _('On'));
			o.default = '0';
			o.optional = false;
			o.cfgvalue = function(section_id) {
				currentWedConfigValue = uci.get('advanced', section_id, 'wed_offloading') || '0';
				currentWedFormValue = currentWedConfigValue;
				return currentWedFormValue;
			};
			o.onchange = function(ev, section_id, value) {
				currentWedFormValue = value;
				setWedApplyStatus();
			};
			o.write = function(section_id, value) {
				if (value !== '0' && value !== '1')
					return;

				currentWedConfigValue = value;
				currentWedFormValue = value;
				uci.set('advanced', section_id, 'wed_offloading', value);
			};

			o = s.option(form.DummyValue, '_wed_apply_status', _('Apply status'));
			o.rawhtml = true;
			o.cfgvalue = function(section_id) {
				currentWedConfigValue = uci.get('advanced', section_id, 'wed_offloading') || '0';
				currentWedFormValue = currentWedConfigValue;

				return E('span', {}, [
					E('span', { 'id': wedApplyStatusId },
						formatWedApplyStatus(currentWedConfigValue, currentWedRuntimeEnabled)),
					' ',
					E('button', {
						'id': wedRebootButtonId,
						'type': 'button',
						'class': 'cbi-button cbi-button-action important',
						'style': wedNeedsReboot(currentWedConfigValue, currentWedRuntimeEnabled) ? null : 'display:none',
						'click': handleWedReboot
					}, _('Reboot'))
				]);
			};

			o = s.option(form.Button, '_read_wed_runtime', _('Runtime WED setting'));
			o.inputtitle = _('Read setting');
			o.inputstyle = 'action';
			o.write = function() {};
			o.remove = function() {};
			o.onclick = function() {
				return refreshWedRuntimeStatus();
			};

			o = s.option(form.DummyValue, '_wed_runtime_output', _('Runtime WED output'));
			o.rawhtml = true;
			o.default = E('span', { 'id': wedRuntimeStatusId },
				formatWedRuntimeStatus(currentWedRuntimeEnabled));
		}

		return m.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			reloadWedAfterApply();
			return ui.changes.apply(mode == '0');
		});
	}
});
