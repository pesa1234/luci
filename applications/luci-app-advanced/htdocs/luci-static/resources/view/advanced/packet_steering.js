'use strict';
'require view';
'require uci';
'require fs';
'require form';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('advanced'),
			uci.load('network')
		]);
	},

	render: function() {
		let m = new form.Map('advanced');
		let pktSteering = uci.get('network', 'globals', 'packet_steering') || '0';

		let s = m.section(form.TypedSection, 'advanced_packet_steering', _('Advanced packet steering setting'),
			_('Configures RPS (Receive Packet Steering) by assigning each network interface to one or more specific CPU cores, in order to distribute incoming network traffic efficiently across the system’s CPUs.'));

		s.anonymous = true;
		s.addremove = false;

		let o = s.option(form.ListValue, "advanced_packet_steering_enable", _("Enable Advanced packet steering"));
		o.value('0', _("Disabled"));
		o.value('1', _("On - Standard (only WiFi)"));
		o.value('2', _("On - Advanced (wan-bridge-WiFi)"));
		o.default = '0';
		
		o.cfgvalue = function(section_id) {
		if (pktSteering === '1' || pktSteering === '2')
			return '0';
		  return uci.get('advanced', section_id, 'advanced_packet_steering_enable') || '0';
		};

		if (pktSteering === '1' || pktSteering === '2') {
		  o.readonly = true;
		  o.description = _('⚠ <br><strong style="color:red">Warning:</strong> "Network - Global Network Option" is enabled. Disable it to enable this setting. ⚠');
		}

		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'advanced_packet_steering_enable', value);
			fs.exec("/etc/init.d/advanced_setup", ["reload", "generic"])
					  .then(() => console.log("advanced_setup reload generic done"))
					  .catch(err => console.error(err));
		};
		
		o = s.option(form.Value, "advanced_packet_steering_delay", _("Boot delay of advanced packet steering"),_('Default: 30 sec'));
		o.value('30', _("30"));
		o.value('10', _("10"));
		o.value('60', _("60"));
		o.datatype = 'integer';
		o.default = '30';

		return m.render();
	}
});
