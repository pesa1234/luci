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

		let s = m.section(form.TypedSection, 'advanced_packet_steering', _('Packet Steering'),
			_('Configures Receive Packet Steering (RPS) by assigning network interfaces to specific CPU cores. This can distribute incoming traffic more evenly across the system and improve overall responsiveness.'));

		s.anonymous = true;
		s.addremove = false;

		let o = s.option(form.ListValue, "advanced_packet_steering_enable", _("Enable Packet Steering"));
		o.value('0', _("Off"));
		o.value('1', _("On - Standard (Wi-Fi only)"));
		o.value('2', _("On - Advanced (WAN, bridge and Wi-Fi)"));
		o.default = '0';
		
		o.cfgvalue = function(section_id) {
		if (pktSteering === '1' || pktSteering === '2')
			return '0';
		  return uci.get('advanced', section_id, 'advanced_packet_steering_enable') || '0';
		};

		if (pktSteering === '1' || pktSteering === '2') {
		  o.readonly = true;
		  o.description = _('"Network > Global network options" packet steering is already enabled. Disable that setting before using this page.');
		}

		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'advanced_packet_steering_enable', value);
			fs.exec("/etc/init.d/advanced_setup", ["reload", "generic"])
					  .then(() => console.log("advanced_setup reload generic done"))
					  .catch(err => console.error(err));
		};
		
		o = s.option(form.Value, "advanced_packet_steering_delay", _("Boot Delay"), _('Delay before advanced packet steering is applied at boot. Default: 30 seconds.'));
		o.value('30', _("30"));
		o.value('10', _("10"));
		o.value('60', _("60"));
		o.datatype = 'integer';
		o.default = '30';

		return m.render();
	}
});
