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
		meaning = _('N means mac80211 airtime fairness is hidden');
	else if (value === 'Y')
		meaning = _('Y means mac80211 airtime fairness is exposed');
	else
		meaning = _('unknown runtime value');

	return 'runtime ATF: %s (expose_airtime_fairness=%s, %s)'.format(
		enabled ? _('On') : _('Off'),
		value || '-',
		meaning);
}

function setAtfRuntimeStatus(text) {
	const node = document.getElementById(atfRuntimeStatusId);

	if (node)
		node.textContent = text;
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
	setAtfRuntimeStatus(_('runtime ATF: reading...'));

	return L.resolveDefault(fs.trimmed(atfRuntimePath), 'Y').then(function(value) {
		currentAtfRuntimeValue = value || 'Y';
		currentAtfRuntimeEnabled = runtimeAtfEnabled(currentAtfRuntimeValue);
		setAtfRuntimeStatus(formatAtfRuntimeStatus(currentAtfRuntimeEnabled, currentAtfRuntimeValue));
		setAtfApplyStatus();

		return currentAtfRuntimeEnabled;
	}).catch(function(err) {
		setAtfRuntimeStatus(_('runtime ATF: unable to read setting'));
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
				setAtfRuntimeStatus(_('runtime ATF: unable to refresh setting'));
				ui.addNotification(null, E('p', err.message));
			});
	};

	document.addEventListener('uci-applied', onApplied);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('advanced'),
			L.resolveDefault(fs.trimmed(atfRuntimePath), 'Y')
		]);
	},

	render: function(data) {
		currentAtfRuntimeValue = data[1] || 'Y';
		currentAtfRuntimeEnabled = runtimeAtfEnabled(currentAtfRuntimeValue);
		currentAtfConfigValue = '1';
		currentAtfFormValue = '1';
		let m = new form.Map('advanced');

		if (L.hasSystemFeature('vow')) {
			let description = _('Airtime Fairness (ATF) allocates Wi-Fi airtime more evenly across clients, helping prevent slower devices from monopolizing the channel. On mt7915e, expose_airtime_fairness=Y keeps mac80211 airtime fairness visible; upstream MediaTek/VOW HW-ATF is controlled by the same setting through the runtime vow_atf debugfs switch when available. Changes to the module mode are applied on the next reboot.');
			let s, o;

			s = m.section(form.TypedSection, 'defaults', _('Airtime Fairness (ATF)'), description);
			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.ListValue, 'atf_enable', _('Enable Airtime Fairness (ATF)'));
			o.value('0', _('Off'));
			o.value('1', _('On'));
			o.optional = false;
			o.default = '1';
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
				uci.set('advanced', section_id, 'atf_enable', value);
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

			o = s.option(form.Button, '_read_atf_runtime', _('Runtime ATF setting'));
			o.inputtitle = _('Read setting');
			o.inputstyle = 'action';
			o.write = function() {};
			o.remove = function() {};
			o.onclick = function() {
				return refreshAtfRuntimeStatus();
			};

			o = s.option(form.DummyValue, '_atf_runtime_output', _('Runtime ATF output'));
			o.rawhtml = true;
			o.default = E('span', { 'id': atfRuntimeStatusId },
				formatAtfRuntimeStatus(currentAtfRuntimeEnabled, currentAtfRuntimeValue));

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
