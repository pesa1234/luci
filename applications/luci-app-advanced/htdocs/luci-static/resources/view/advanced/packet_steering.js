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

		s = m.section(form.TypedSection, 'advanced_packet_steering', _('Advanced packet steering setting'),
			_('Configures RPS (Receive Packet Steering) by assigning each network interface to one or more specific CPU cores, in order to distribute incoming network traffic efficiently across the system’s CPUs.'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.ListValue, "advanced_packet_steering_enable", _("Enable Advanced packet steering"));
		o.value('0', _("Disabled"));
		o.value('1', _("On - Standard (only WiFi)"));
		o.value('2', _("On - Advanced (wan-bridge-WiFi)"));
		o.cfgvalue = function(section_id) {
		return uci.get('advanced', section_id, 'advanced_packet_steering_enable') || '0';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'advanced_packet_steering_enable', value);
			fs.exec('/etc/init.d/advanced_setup', ['start']);
		};
		

		return m.render();
	},
});
