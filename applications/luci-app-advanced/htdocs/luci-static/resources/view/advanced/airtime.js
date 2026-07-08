'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';

const atfRuntimeStatusId = 'advanced-atf-runtime-status';
const atfApplyStatusId = 'advanced-atf-apply-status';

let currentAtfConfigValue = '1';
let currentAtfFormValue = '1';
let currentAtfRuntimeOutput = '';

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
			L.resolveDefault(readAtfRuntimeOutput(), '')
		]);
	},

	render: function(data) {
		currentAtfRuntimeOutput = data[1] || _('Runtime status: VOW runtime status unavailable');
		currentAtfConfigValue = '1';
		currentAtfFormValue = '1';
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

		return m.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			reloadAtfAfterApply();
			return ui.changes.apply(mode == '0');
		});
	}
});
