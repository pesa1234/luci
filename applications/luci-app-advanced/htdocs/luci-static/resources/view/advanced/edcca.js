'use strict';
'require view';
'require uci';
'require fs';
'require form';

// Project code format is tabs, not spaces
return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('advanced');

		s = m.section(form.TypedSection, 'edcca', _('EDCCA setting'),
			_('EDCCA is a mechanism that allows Wi-Fi devices to detect whether the channel is free before transmitting. This works by measuring the energy level in the channel: If the detected signal is below a certain threshold, the device transmits. If the signal is above the threshold, the device waits to avoid collisions'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.ListValue, "edcca_enable", _("Enable EDCCA Compensation"));
		o.value('0', _("Disabled"));
		o.value('1', _("On - Auto"));
		o.cfgvalue = function(section_id) {
		return uci.get('advanced', section_id, 'edcca_enable') || '1';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'edcca_enable', value);
			fs.exec('/sbin/wifi', ['down']);
			fs.exec('/sbin/wifi', ['up']);
		};
		
		o = s.option(form.Value, "compensation", _("EDCCA Compensation"),_('Default: -6 - Range: -126 to 126'));
		o.value('-2', _("-2"));
		o.value('-6', _("-6"));
		o.value('-10', _("-10"));
		o.depends('edcca_enable', '1');
		o.datatype = 'integer';
		o.cfgvalue = function(section_id) {
		return uci.get('advanced', section_id, 'compensation') || '-6';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'compensation', value);
			fs.exec('/sbin/wifi', ['down']);
			fs.exec('/sbin/wifi', ['up']);
		};
			
		o = s.option(form.Value, "thres_0", _("EDCCA BW20"),_('Default: -60: dbm - Range: -126 to 0'));
		o.value('-55', _("-55"));
		o.value('-60', _("-60"));
		o.value('-65', _("-65"));
		o.depends('edcca_enable', '1');
		o.datatype = 'integer';
		o.cfgvalue = function(section_id) {
		return uci.get('advanced', section_id, 'thres_0') || '-60';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'thres_0', value);
			fs.exec('/sbin/wifi', ['down']);
			fs.exec('/sbin/wifi', ['up']);
		};
			
		o = s.option(form.Value, "thres_1", _("EDCCA BW40"),_('Default: -62: dbm - Range: -126 to 0'));
		o.value('-57', _("-57"));
		o.value('-62', _("-62"));
		o.value('-67', _("-67"));
		o.depends('edcca_enable', '1');
		o.datatype = 'integer';
		o.cfgvalue = function(section_id) {
		return uci.get('advanced', section_id, 'thres_1') || '-62';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'thres_1', value);
			fs.exec('/sbin/wifi', ['down']);
			fs.exec('/sbin/wifi', ['up']);
		};
			
		o = s.option(form.Value, "thres_2", _("EDCCA BW80"),_('Default: -59: dbm - Range: -126 to 0'));
		o.value('-54', _("-54"));
		o.value('-59', _("-59"));
		o.value('-64', _("-64"));
		o.depends('edcca_enable', '1');
		o.datatype = 'integer';
		o.cfgvalue = function(section_id) {
		return uci.get('advanced', section_id, 'thres_2') || '-59';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'thres_2', value);
			fs.exec('/sbin/wifi', ['down']);
			fs.exec('/sbin/wifi', ['up']);
		};

		return m.render();
	},
});
