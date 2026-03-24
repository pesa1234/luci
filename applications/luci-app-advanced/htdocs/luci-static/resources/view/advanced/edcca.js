'use strict';
'require view';
'require uci';
'require fs';
'require ui';
'require form';

// Project code format is tabs, not spaces
const mapProfiles = {
	default: {
		compensation: '-6',
		thres_0: '-60',
		thres_1: '-62',
		thres_2: '-59',
		thres_3: '-54'
	},
	conservative: {
		compensation: '-10',
		thres_0: '-65',
		thres_1: '-67',
		thres_2: '-64',
		thres_3: '-59'
	},
	stable: {
		compensation: '-6',
		thres_0: '-60',
		thres_1: '-62',
		thres_2: '-59',
		thres_3: '-54'
	},
	balanced: {
		compensation: '-4',
		thres_0: '-57',
		thres_1: '-59',
		thres_2: '-56',
		thres_3: '-52'
	},
	aggressive: {
		compensation: '-2',
		thres_0: '-53',
		thres_1: '-55',
		thres_2: '-52',
		thres_3: '-49'
	}
};

const defaultProfile = mapProfiles.default;
const presetProfiles = Object.keys(mapProfiles);
const presetValueOptions = [ 'compensation', 'thres_0', 'thres_1', 'thres_2', 'thres_3' ];
let map;
let needsWifiRestart = false;

function getUciValue(section_id, option, fallback) {
	return uci.get('advanced', section_id, option) || fallback;
}

function getSectionValues(section_id) {
	return {
		compensation: getUciValue(section_id, 'compensation', defaultProfile.compensation),
		thres_0: getUciValue(section_id, 'thres_0', defaultProfile.thres_0),
		thres_1: getUciValue(section_id, 'thres_1', defaultProfile.thres_1),
		thres_2: getUciValue(section_id, 'thres_2', defaultProfile.thres_2),
		thres_3: getUciValue(section_id, 'thres_3', defaultProfile.thres_3)
	};
}

function detectSectionProfile(section_id) {
	const storedProfile = uci.get('advanced', section_id, 'profile');
	const values = getSectionValues(section_id);

	if (storedProfile === 'custom')
		return storedProfile;

	if (mapProfiles[storedProfile] != null)
		return storedProfile;

	for (let profile of presetProfiles) {
		const settings = mapProfiles[profile];

		if (settings.compensation === values.compensation &&
		    settings.thres_0 === values.thres_0 &&
		    settings.thres_1 === values.thres_1 &&
		    settings.thres_2 === values.thres_2 &&
		    settings.thres_3 === values.thres_3)
			return profile;
	}

	return 'custom';
}

function getSelectedProfile(section_id) {
	const storedProfile = uci.get('advanced', section_id, 'profile');

	if (storedProfile === 'custom' || mapProfiles[storedProfile] != null)
		return storedProfile;

	return detectSectionProfile(section_id);
}

function getPresetDisplayValue(section_id, option) {
	const profile = getSelectedProfile(section_id);
	const settings = mapProfiles[profile];

	if (settings != null && settings[option] != null)
		return settings[option];

	return getUciValue(section_id, option, defaultProfile[option]);
}

function applyPresetToWidgets(section_id, profile) {
	const settings = mapProfiles[profile];

	if (settings == null)
		return;

	for (let option of presetValueOptions) {
		const editableLookup = map.lookupOption(option, section_id);
		const previewLookup = map.lookupOption(`_preset_${option}`, section_id);
		const editableOption = editableLookup ? editableLookup[0] : null;
		const previewOption = previewLookup ? previewLookup[0] : null;
		const editableWidget = editableOption ? editableOption.getUIElement(section_id) : null;
		const previewWidget = previewOption ? previewOption.getUIElement(section_id) : null;

		if (editableWidget)
			editableWidget.setValue(settings[option]);

		if (previewWidget)
			previewWidget.setValue(settings[option]);
	}
}

function addCustomDepends(option) {
	option.depends({
		edcca_enable: '1',
		profile: 'custom'
	});
}

function addPresetDepends(option) {
	for (let profile of presetProfiles) {
		option.depends({
			edcca_enable: '1',
			profile: profile
		});
	}
}

function restartWifi() {
	return fs.exec('/sbin/wifi', [ 'down' ]).then(function() {
		return fs.exec('/sbin/wifi', [ 'up' ]);
	});
}

return view.extend({
	render: function() {
		let s, o;

		map = new form.Map('advanced');

		s = map.section(form.TypedSection, 'edcca', _('EDCCA'),
			_('Energy Detect Clear Channel Assessment (EDCCA) controls how aggressively the radio considers the channel busy before transmitting. Select a preset to preview fixed values in read-only fields, or choose Custom to edit the values directly. Wi-Fi is restarted once after saving changes.'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.ListValue, 'edcca_enable', _('Enable EDCCA'));
		o.value('0', _('Off'));
		o.value('1', _('On'));
		o.cfgvalue = function(section_id) {
			return getUciValue(section_id, 'edcca_enable', '1');
		};
		o.write = function(section_id, value) {
			needsWifiRestart = true;
			uci.set('advanced', section_id, 'edcca_enable', value);
		};

		o = s.option(form.ListValue, 'profile', _('EDCCA Profile'),
			_('Preset profiles show non-editable values. Custom unlocks direct editing.'));
		o.value('default', _('Default'));
		o.value('conservative', _('Conservative'));
		o.value('stable', _('Stable'));
		o.value('balanced', _('Balanced'));
		o.value('aggressive', _('Aggressive'));
		o.value('custom', _('Custom'));
		o.depends({ edcca_enable: '1' });
		o.cfgvalue = function(section_id) {
			return detectSectionProfile(section_id);
		};
		o.onchange = function(ev, section_id, value) {
			applyPresetToWidgets(section_id, value);
		};
		o.write = function(section_id, value) {
			const settings = mapProfiles[value];

			uci.set('advanced', section_id, 'profile', value);

			if (settings == null)
				return;

			needsWifiRestart = true;
			for (let option of presetValueOptions)
				uci.set('advanced', section_id, option, settings[option]);
		};

		o = s.option(form.Value, 'compensation', _('EDCCA Compensation'), _('Code default: -6. Range: -126 to 126.'));
		o.value('-10', _('-10'));
		o.value('-6', _('-6'));
		o.value('-4', _('-4'));
		o.value('-2', _('-2'));
		o.datatype = 'integer';
		addCustomDepends(o);
		o.cfgvalue = function(section_id) {
			return getUciValue(section_id, 'compensation', defaultProfile.compensation);
		};
		o.write = function(section_id, value) {
			needsWifiRestart = true;
			uci.set('advanced', section_id, 'compensation', value);
		};

		o = s.option(form.Value, '_preset_compensation', _('EDCCA Compensation'), _('Preset value. Switch to Custom to edit.'));
		o.readonly = true;
		addPresetDepends(o);
		o.cfgvalue = function(section_id) {
			return getPresetDisplayValue(section_id, 'compensation');
		};

		o = s.option(form.Value, 'thres_0', _('EDCCA Threshold BW20'), _('Code default: -60 dBm. Range: -126 to 0 dBm.'));
		o.value('-65', _('-65'));
		o.value('-60', _('-60'));
		o.value('-57', _('-57'));
		o.value('-53', _('-53'));
		o.datatype = 'integer';
		addCustomDepends(o);
		o.cfgvalue = function(section_id) {
			return getUciValue(section_id, 'thres_0', defaultProfile.thres_0);
		};
		o.write = function(section_id, value) {
			needsWifiRestart = true;
			uci.set('advanced', section_id, 'thres_0', value);
		};

		o = s.option(form.Value, '_preset_thres_0', _('EDCCA Threshold BW20'), _('Preset value. Switch to Custom to edit.'));
		o.readonly = true;
		addPresetDepends(o);
		o.cfgvalue = function(section_id) {
			return getPresetDisplayValue(section_id, 'thres_0');
		};

		o = s.option(form.Value, 'thres_1', _('EDCCA Threshold BW40'), _('Code default: -62 dBm. Range: -126 to 0 dBm.'));
		o.value('-67', _('-67'));
		o.value('-62', _('-62'));
		o.value('-59', _('-59'));
		o.value('-55', _('-55'));
		o.datatype = 'integer';
		addCustomDepends(o);
		o.cfgvalue = function(section_id) {
			return getUciValue(section_id, 'thres_1', defaultProfile.thres_1);
		};
		o.write = function(section_id, value) {
			needsWifiRestart = true;
			uci.set('advanced', section_id, 'thres_1', value);
		};

		o = s.option(form.Value, '_preset_thres_1', _('EDCCA Threshold BW40'), _('Preset value. Switch to Custom to edit.'));
		o.readonly = true;
		addPresetDepends(o);
		o.cfgvalue = function(section_id) {
			return getPresetDisplayValue(section_id, 'thres_1');
		};

		o = s.option(form.Value, 'thres_2', _('EDCCA Threshold BW80'), _('Code default: -59 dBm. Range: -126 to 0 dBm.'));
		o.value('-64', _('-64'));
		o.value('-59', _('-59'));
		o.value('-56', _('-56'));
		o.value('-52', _('-52'));
		o.datatype = 'integer';
		addCustomDepends(o);
		o.cfgvalue = function(section_id) {
			return getUciValue(section_id, 'thres_2', defaultProfile.thres_2);
		};
		o.write = function(section_id, value) {
			needsWifiRestart = true;
			uci.set('advanced', section_id, 'thres_2', value);
		};

		o = s.option(form.Value, '_preset_thres_2', _('EDCCA Threshold BW80'), _('Preset value. Switch to Custom to edit.'));
		o.readonly = true;
		addPresetDepends(o);
		o.cfgvalue = function(section_id) {
			return getPresetDisplayValue(section_id, 'thres_2');
		};

		o = s.option(form.Value, 'thres_3', _('EDCCA Threshold BW160'), _('Code default: -54 dBm. Range: -126 to 0 dBm.'));
		o.value('-59', _('-59'));
		o.value('-54', _('-54'));
		o.value('-52', _('-52'));
		o.value('-49', _('-49'));
		o.datatype = 'integer';
		addCustomDepends(o);
		o.cfgvalue = function(section_id) {
			return getUciValue(section_id, 'thres_3', defaultProfile.thres_3);
		};
		o.write = function(section_id, value) {
			needsWifiRestart = true;
			uci.set('advanced', section_id, 'thres_3', value);
		};

		o = s.option(form.Value, '_preset_thres_3', _('EDCCA Threshold BW160'), _('Preset value. Switch to Custom to edit.'));
		o.readonly = true;
		addPresetDepends(o);
		o.cfgvalue = function(section_id) {
			return getPresetDisplayValue(section_id, 'thres_3');
		};

		return map.render().then(function(nodes) {
			uci.sections('advanced', 'edcca', function(section) {
				applyPresetToWidgets(section['.name'], detectSectionProfile(section['.name']));
			});

			return nodes;
		});
	},

	handleSave: function(ev) {
		return map.save().then(function() {
			if (!needsWifiRestart)
				return;

			needsWifiRestart = false;
			return restartWifi();
		}, function(err) {
			needsWifiRestart = false;
			throw err;
		});
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			return ui.changes.apply(mode == '0');
		});
	},

	handleReset: null
});
