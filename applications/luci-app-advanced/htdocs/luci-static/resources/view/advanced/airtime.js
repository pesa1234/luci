'use strict';
'require view';
'require form';
'require fs';
'require rpc';
'require ui';
'require uci';

const atfRuntimePath = '/sys/module/mt7915e/parameters/expose_airtime_fairness';
const atfRuntimeStatusId = 'advanced-atf-runtime-status';
const atfApplyStatusId = 'advanced-atf-apply-status';
const atfRebootButtonId = 'advanced-atf-reboot-button';

let currentAtfConfigValue = '1';
let currentAtfFormValue = '1';
let currentAtfRuntimeEnabled = true;
let currentAtfRuntimeValue = 'Y';
let currentAtfRuntimeOutput = '';

const callReboot = rpc.declare({
	object: 'system',
	method: 'reboot',
	expect: { result: 0 }
});

function runtimeAtfEnabled(value) {
	return value === 'Y';
}

function atfNeedsReboot(configValue, runtimeEnabled) {
	return ((configValue === '1') !== (runtimeEnabled === true));
}

function formatAtfRuntimeStatus(enabled, value) {
	let meaning;

	if (value === 'N')
		meaning = _('Linux ATF stays hidden until reboot or driver reload');
	else if (value === 'Y')
		meaning = _('Linux ATF is visible to the Wi-Fi stack');
	else
		meaning = _('unknown runtime value');

	return 'Runtime status: Linux ATF=%s (module=%s, %s)'.format(
		enabled ? _('On') : _('Off'),
		value || '-',
		meaning);
}

function setAtfRuntimeStatus(text) {
	const node = document.getElementById(atfRuntimeStatusId);

	if (node)
		node.textContent = text;
}

function readAtfRuntimeOutput() {
	return fs.exec('/etc/init.d/advanced_setup', [ 'runtime_atf' ]).then(function(res) {
		let output = res && res.stdout ? res.stdout.trim() : '';

		return output || formatAtfRuntimeStatus(currentAtfRuntimeEnabled, currentAtfRuntimeValue);
	});
}

function formatAtfApplyStatus(configValue, runtimeEnabled) {
	if (currentAtfFormValue !== currentAtfConfigValue)
		return _('Save & Apply is required');

	return atfNeedsReboot(configValue, runtimeEnabled)
		? _('Reboot is required')
		: _('Applied');
}

function setAtfApplyStatus() {
	const node = document.getElementById(atfApplyStatusId);
	const rebootAllowed = currentAtfFormValue === currentAtfConfigValue;

	if (node)
		node.textContent = formatAtfApplyStatus(currentAtfConfigValue, currentAtfRuntimeEnabled);

	const rebootButton = document.getElementById(atfRebootButtonId);

	if (rebootButton)
		rebootButton.style.display = rebootAllowed &&
			atfNeedsReboot(currentAtfConfigValue, currentAtfRuntimeEnabled) ? '' : 'none';
}

function refreshAtfRuntimeStatus() {
	setAtfRuntimeStatus(_('Runtime status: reading...'));

	return Promise.all([
		L.resolveDefault(fs.trimmed(atfRuntimePath), 'Y'),
		L.resolveDefault(readAtfRuntimeOutput(), '')
	]).then(function(data) {
		currentAtfRuntimeValue = data[0] || 'Y';
		currentAtfRuntimeEnabled = runtimeAtfEnabled(currentAtfRuntimeValue);
		currentAtfRuntimeOutput = data[1] || formatAtfRuntimeStatus(currentAtfRuntimeEnabled, currentAtfRuntimeValue);
		setAtfRuntimeStatus(currentAtfRuntimeOutput);
		setAtfApplyStatus();

		return currentAtfRuntimeEnabled;
	}).catch(function(err) {
		setAtfRuntimeStatus(_('Runtime status: unable to read setting'));
	});
}

function handleAtfReboot(ev) {
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

function reloadAtfAfterApply() {
	const onApplied = function() {
		document.removeEventListener('uci-applied', onApplied);

		fs.exec('/etc/init.d/advanced_setup', [ 'reload', 'atf' ])
			.then(refreshAtfRuntimeStatus)
			.catch(function(err) {
				setAtfRuntimeStatus(_('Runtime status: unable to refresh setting'));
				ui.addNotification(null, E('p', err.message));
			});
	};

	document.addEventListener('uci-applied', onApplied);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('advanced'),
			L.resolveDefault(fs.trimmed(atfRuntimePath), 'Y'),
			L.resolveDefault(readAtfRuntimeOutput(), '')
		]);
	},

	render: function(data) {
		currentAtfRuntimeValue = data[1] || 'Y';
		currentAtfRuntimeEnabled = runtimeAtfEnabled(currentAtfRuntimeValue);
		currentAtfRuntimeOutput = data[2] || formatAtfRuntimeStatus(currentAtfRuntimeEnabled, currentAtfRuntimeValue);
		currentAtfConfigValue = '1';
		currentAtfFormValue = '1';
		let m = new form.Map('advanced');

		if (L.hasSystemFeature('vow') || L.hasSystemFeature('wedoffload')) {
			let description = _('Balances Wi-Fi airtime so slower clients cannot dominate the channel. On MT7915, On enables both Linux Airtime Fairness and MediaTek VOW ATF/WATF. Save & Apply updates VOW immediately when supported by the driver; the Reboot button appears only when the Linux module state still needs a reboot.');
			let s, o;

			s = m.section(form.TypedSection, 'defaults', _('Airtime Fairness (ATF/WATF)'), description);
			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.ListValue, 'atf_enable', _('Enable Airtime Fairness'));
			o.value('0', _('Off'));
			o.value('1', _('On'));
			o.optional = false;
			o.default = '1';
			o.rmempty = false;
			o.cfgvalue = function(section_id) {
				currentAtfConfigValue = uci.get('advanced', section_id, 'atf_enable') || '1';
				currentAtfFormValue = currentAtfConfigValue;
				return currentAtfFormValue;
			};
			o.onchange = function(ev, section_id, value) {
				currentAtfFormValue = value;
				setAtfApplyStatus();
			};
			o.write = function(section_id, value) {
				if (value !== '0' && value !== '1')
					return;

				currentAtfConfigValue = value;
				currentAtfFormValue = value;
				return uci.set('advanced', section_id, 'atf_enable', value);
			};
			o.remove = function(section_id) {
				currentAtfConfigValue = '1';
				currentAtfFormValue = '1';
				return uci.set('advanced', section_id, 'atf_enable', '1');
			};

			o = s.option(form.DummyValue, '_atf_apply_status', _('Apply status'));
			o.rawhtml = true;
			o.cfgvalue = function(section_id) {
				currentAtfConfigValue = uci.get('advanced', section_id, 'atf_enable') || '1';
				currentAtfFormValue = currentAtfConfigValue;

				return E('span', {}, [
					E('span', { 'id': atfApplyStatusId },
						formatAtfApplyStatus(currentAtfConfigValue, currentAtfRuntimeEnabled)),
					' ',
					E('button', {
						'id': atfRebootButtonId,
						'type': 'button',
						'class': 'cbi-button cbi-button-action important',
						'style': atfNeedsReboot(currentAtfConfigValue, currentAtfRuntimeEnabled) ? null : 'display:none',
						'click': handleAtfReboot
					}, _('Reboot'))
				]);
			};

			o = s.option(form.Button, '_read_atf_runtime', _('Runtime status'));
			o.inputtitle = _('Read status');
			o.inputstyle = 'action';
			o.write = function() {};
			o.remove = function() {};
			o.onclick = function() {
				return refreshAtfRuntimeStatus();
			};

			o = s.option(form.DummyValue, '_atf_runtime_output', _('Runtime details'));
			o.rawhtml = true;
			o.default = E('span', { 'id': atfRuntimeStatusId },
				currentAtfRuntimeOutput);

		}

		return m.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			reloadAtfAfterApply();
			return ui.changes.apply(mode == '0');
		});
	}
});
