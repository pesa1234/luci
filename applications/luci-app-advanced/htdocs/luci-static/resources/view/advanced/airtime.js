'use strict';
'require view';
'require form';
'require fs';
'require rpc';
'require ui';
'require uci';

const atfRuntimeStatusId = 'advanced-atf-runtime-status';
const atfApplyStatusId = 'advanced-atf-apply-status';

/* mt7915e reads this module parameter at probe time only */
const deferredParamPath = '/sys/module/mt7915e/parameters/deferred_airtime_report';
const deferredRuntimeStatusId = 'advanced-deferred-runtime-status';
const deferredApplyStatusId = 'advanced-deferred-apply-status';
const deferredRebootButtonId = 'advanced-deferred-reboot-button';

let currentAtfConfigValue = '1';
let currentAtfFormValue = '1';
let currentAtfRuntimeOutput = '';

let currentDeferredConfigValue = '1';
let currentDeferredFormValue = '1';
let currentDeferredRuntime = '';

const callReboot = rpc.declare({
	object: 'system',
	method: 'reboot',
	expect: { result: 0 }
});

function setAtfRuntimeStatus(text) {
	const node = document.getElementById(atfRuntimeStatusId);

	if (node)
		node.textContent = text;
}

function readAtfRuntimeOutput() {
	return fs.exec('/etc/init.d/advanced_setup', [ 'runtime_atf' ]).then(function(res) {
		let output = res && res.stdout ? res.stdout.trim() : '';

		return output || _('Runtime status: VOW runtime status unavailable');
	});
}

function formatAtfApplyStatus() {
	if (currentAtfFormValue !== currentAtfConfigValue)
		return _('Save & Apply is required');

	return _('Applied');
}

function setAtfApplyStatus() {
	const node = document.getElementById(atfApplyStatusId);

	if (node)
		node.textContent = formatAtfApplyStatus();
}

function refreshAtfRuntimeStatus() {
	setAtfRuntimeStatus(_('Runtime status: reading...'));

	return L.resolveDefault(readAtfRuntimeOutput(), '').then(function(output) {
		currentAtfRuntimeOutput = output || _('Runtime status: VOW runtime status unavailable');
		setAtfRuntimeStatus(currentAtfRuntimeOutput);
		setAtfApplyStatus();

		return currentAtfRuntimeOutput;
	}).catch(function(err) {
		setAtfRuntimeStatus(_('Runtime status: unable to read setting'));
	});
}

function readDeferredRuntime() {
	return L.resolveDefault(fs.trimmed(deferredParamPath), '');
}

function deferredSupported() {
	return currentDeferredRuntime === 'Y' || currentDeferredRuntime === 'N';
}

function readDeferredConfig(section_id) {
	/* Unset in a configuration from before this option: follow the loaded driver */
	return uci.get('advanced', section_id, 'deferred_airtime_report') ||
		(currentDeferredRuntime === 'N' ? '0' : '1');
}

function deferredNeedsReboot() {
	return ((currentDeferredConfigValue === '1') !== (currentDeferredRuntime === 'Y'));
}

function formatDeferredRuntimeStatus() {
	return 'deferred_airtime_report=%s (%s)'.format(
		currentDeferredRuntime,
		currentDeferredRuntime === 'Y' ? _('On') : _('Off'));
}

function formatDeferredApplyStatus() {
	if (currentDeferredFormValue !== currentDeferredConfigValue)
		return _('Save & Apply is required');

	return deferredNeedsReboot() ? _('Reboot is required') : _('Applied');
}

function setDeferredApplyStatus() {
	const node = document.getElementById(deferredApplyStatusId);
	const rebootButton = document.getElementById(deferredRebootButtonId);

	if (node)
		node.textContent = formatDeferredApplyStatus();

	if (rebootButton)
		rebootButton.style.display =
			currentDeferredFormValue === currentDeferredConfigValue &&
			deferredNeedsReboot() ? '' : 'none';
}

function refreshDeferredRuntimeStatus() {
	if (!deferredSupported())
		return Promise.resolve();

	return readDeferredRuntime().then(function(value) {
		const node = document.getElementById(deferredRuntimeStatusId);

		if (value === 'Y' || value === 'N')
			currentDeferredRuntime = value;

		if (node)
			node.textContent = formatDeferredRuntimeStatus();

		setDeferredApplyStatus();
	});
}

function handleDeferredReboot(ev) {
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
			.then(refreshDeferredRuntimeStatus)
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
			L.resolveDefault(readAtfRuntimeOutput(), ''),
			readDeferredRuntime()
		]);
	},

	render: function(data) {
		currentAtfRuntimeOutput = data[1] || _('Runtime status: VOW runtime status unavailable');
		currentAtfConfigValue = '1';
		currentAtfFormValue = '1';
		currentDeferredRuntime = data[2] || '';
		currentDeferredConfigValue = '1';
		currentDeferredFormValue = '1';
		let m = new form.Map('advanced');

		if (L.hasSystemFeature('vow') || L.hasSystemFeature('wedoffload')) {
			let description = _('Balances Wi-Fi airtime so slower clients cannot dominate the channel. On MT7915, this controls only the MediaTek VOW ATF/WATF runtime setting; Linux airtime fairness remains visible to the Wi-Fi stack. Save & Apply updates the setting immediately when supported by the driver, without requiring a reboot.');
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
						formatAtfApplyStatus())
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

		/* Shown only when the loaded mt7915e has the module parameter */
		if (deferredSupported()) {
			let description = _('The firmware reports the airtime of each station about twice a second. With this setting the Linux Wi-Fi stack keeps the airtime estimate of a completed frame until the next report (mac80211 flag DEFERRED_AIRTIME_REPORT), so the order in which stations are served follows their airtime more closely. The firmware ATF/WATF above still shares the airtime. This is the mt7915e module parameter deferred_airtime_report; changes are applied on the next reboot.');
			let s, o;

			s = m.section(form.TypedSection, 'defaults', _('Deferred Airtime Report'), description);
			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.ListValue, 'deferred_airtime_report', _('Enable Deferred Airtime Report'));
			o.value('0', _('Off'));
			o.value('1', _('On'));
			o.optional = false;
			o.default = '1';
			o.rmempty = false;
			o.cfgvalue = function(section_id) {
				currentDeferredConfigValue = readDeferredConfig(section_id);
				currentDeferredFormValue = currentDeferredConfigValue;
				return currentDeferredFormValue;
			};
			o.onchange = function(ev, section_id, value) {
				currentDeferredFormValue = value;
				setDeferredApplyStatus();
			};
			o.write = function(section_id, value) {
				if (value !== '0' && value !== '1')
					return;

				currentDeferredConfigValue = value;
				currentDeferredFormValue = value;
				return uci.set('advanced', section_id, 'deferred_airtime_report', value);
			};
			o.remove = function(section_id) {
				currentDeferredConfigValue = '1';
				currentDeferredFormValue = '1';
				return uci.set('advanced', section_id, 'deferred_airtime_report', '1');
			};

			o = s.option(form.DummyValue, '_deferred_apply_status', _('Apply status'));
			o.rawhtml = true;
			o.cfgvalue = function(section_id) {
				currentDeferredConfigValue = readDeferredConfig(section_id);
				currentDeferredFormValue = currentDeferredConfigValue;

				return E('span', {}, [
					E('span', { 'id': deferredApplyStatusId },
						formatDeferredApplyStatus()),
					' ',
					E('button', {
						'id': deferredRebootButtonId,
						'type': 'button',
						'class': 'cbi-button cbi-button-action important',
						'style': deferredNeedsReboot() ? null : 'display:none',
						'click': handleDeferredReboot
					}, _('Reboot'))
				]);
			};

			o = s.option(form.DummyValue, '_deferred_runtime_output', _('Runtime setting'));
			o.rawhtml = true;
			o.default = E('span', { 'id': deferredRuntimeStatusId },
				formatDeferredRuntimeStatus());
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
