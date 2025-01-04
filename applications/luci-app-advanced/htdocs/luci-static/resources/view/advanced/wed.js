'use strict';
'require view';
'require form';
'require fs';
'require rpc';
'require uci';
'require ui';

// Project code format is tabs, not spaces
return view.extend({
	callConntrackHelpers: rpc.declare({
		object: 'luci',
		method: 'getConntrackHelpers',
		expect: { result: [] }
	}),
	
		
	render: function() {

		let m, s, o;

		m = new form.Map('advanced');
		
		/* mt7915 specific Wired Ethernet Dispatch (WED) */
		
		if (L.hasSystemFeature('wedoffload')) {
			const callSetWED = rpc.declare({
				object: 'luci',
				method: 'setWED',
				params: [ 'enabled' ],
				expect: { enabled: false }
			});
 			const callGetWED = rpc.declare({
				object: 'luci',
				method: 'getWED',
				params: [ 'enabled' ],
				expect: { enabled: false }
			});
			s = m.section(form.TypedSection, 'defaults', _('WED Offloading'),
				_('Wireless Ethernet Dispatch (WED). It is an extension of hardware flow offloading it can reduce CPU loads, increase routing throughput and ping of wireless devices. ***After saved and apply this change, a reboot of the device is necessary to take effect.***'));
			s.anonymous = true;
			s.addremove = false;
			o = s.option(form.ListValue, "wed_enable", _("WED"));
			o.value('0', _("Off"));
			o.value('1', _("On"));
			o.optional = false;
			o.load = async function(section_id) {
				let ret = await callGetWED().then((enabled) => { return enabled });
				if (!ret) return '0';
				if (ret) return '1';
			};
			o.write = async function(section_id, value) {
				if (value && (value == '1' || value == '0')) {
					const ret = await callSetWED(value == '1' ? true : false).then((enabled) => {
						return enabled;
					});
					if (!ret) {
						uci.unset('advanced', section_id, 'wed_offloading');
						return '0';
						}
					if (ret) {
						uci.set('advanced', section_id, 'wed_offloading', '1');
						return '1';
						}
				}
			};
		}
		
		/* mt7915 specific HW ATF */
		
		if (L.hasSystemFeature('vow')) {
			
			s = m.section(form.TypedSection, 'defaults', _('Hardware AirTimeFairness - Enable WED to set-up'),
				_('The primary purpose of ATF is to optimize wireless network performance by ensuring that all connected devices receive a fair share of the available airtime on a Wi-Fi channel, regardless of their speed or capabilities. '));
			s.anonymous = true;
			s.addremove = false;
			o = s.option(form.ListValue, "atf_enable", _("Enable ATF"));
			o.value('0', _("Off"));
			o.value('1', _("On"));
			o.optional = false;
			o.depends('wed_enable', '1');
			o.default = uci.get('advanced', 'defaults', 'atf_enable');
			o.write = function(section_id, value) {
				uci.set('advanced', section_id, 'atf_enable',value);
				fs.exec('/etc/init.d/advanced_setup', ['start']);
			};
			
			o = s.option(form.ListValue, "hw_atf_enable", _("Enable HW ATF"));
			o.value('0', _("Off"));
			o.value('1', _("On"));
			o.optional = false;
			o.depends('wed_enable', '1');
			o.default = uci.get('advanced', 'defaults', 'hw_atf_enable');
			o.write = function(section_id, value) {
				uci.set('advanced', section_id, 'hw_atf_enable',value);
			};
						
		}	
 
		return m.render();
	},
});

