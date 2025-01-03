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
	
	load: function() {
		return Promise.all([
			this.callConntrackHelpers(),
			uci.load('mtkhnat')
		]);
	},
	
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
		
		/* HQoS specific Hardware Quality of Service */
		
 		if (L.hasSystemFeature('hqos')) {
			
		
			s = m.section(form.TypedSection, 'defaults', _('HQoS - Experimental'),
				_('Hardware QoS - full settings on /etc/config/mtkhnat'));
			s.anonymous = true;
			s.addremove = false;
			o = s.option(form.ListValue, "enable", _("Enable mtkhnat util"));
			o.value('0', _("Off"));
			o.value('1', _("On"));
			o.optional = false;
			o.default = uci.get('mtkhnat', 'global', 'enable');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'enable',value);
			};
		
			o = s.option(form.ListValue, "hqos", _("Enable HQoS"),_('Enable/Disable Hardware QoS Fature'));
			o.value('0', _("Off"));
			o.value('1', _("On"));
			o.depends('enable', '1');
			o.optional = false;
			o.default = uci.get('mtkhnat', 'global', 'hqos');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'hqos',value);
				fs.exec_direct('/sbin/mtkhnat');
			};
			
			o = s.option(form.ListValue, "hqos_type", _("MTK proprietary HQoS-type"),_('0-Disabled 1-HQos 2-Per-port-per-queue mode'));
			o.value('0', _("Disabled"));
			o.value('1', _("HQoS"));
			o.value('2', _("PPPQ"));
			o.depends('enable', '1');
			o.optional = false;
			o.default = uci.get('mtkhnat', 'global', 'hqos_type');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'hqos_type',value);
			};
			
			o = s.option(form.ListValue, "txq_num", _("txq_num"),_('16:default'));
			o.value('16', _("16"));
			o.value('32', _("32"));
			o.value('64', _("64"));
			o.value('128', _("128"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'txq_num');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'txq_num',value);
			};
			
			o = s.option(form.ListValue, "sch_num", _("sch_num"),_('sch_num: 2 or 4'));
			o.value('2', _("2"));
			o.value('4', _("4"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch_num');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch_num',value);
			};
			
			o = s.option(form.ListValue, "scheduling", _("scheduling"),_('scheduling: wrr: weighted round-robin, sp: strict priority'));
			o.value('wrr', _("wrr"));
			o.value('sp', _("sp"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'scheduling');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'scheduling',value);
			};
			
			o = s.option(form.Value, "sch0_bw", _("sch0_bw"),_('(unit:Kbps)'));
			o.value('1000000', _("1000000 for 1gbps"));
			o.value('2500000', _("2500000 for 2.5gbps"));
			o.value('10000000', _("10000000 for 10gbps"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch0_bw');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch0_bw',value);
			};
			
			o = s.option(form.Value, "sch1_bw", _("sch1_bw"),_('(unit:Kbps)'));
			o.value('1000000', _("1000000 for 1gbps"));
			o.value('2500000', _("2500000 for 2.5gbps"));
			o.value('10000000', _("10000000 for 10gbps"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch1_bw');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch1_bw',value);
			};
			
			o = s.option(form.Value, "sch2_bw", _("sch2_bw"),_('(unit:Kbps)'));
			o.value('1000000', _("1000000 for 1gbps"));
			o.value('2500000', _("2500000 for 2.5gbps"));
			o.value('10000000', _("10000000 for 10gbps"));
			o.depends('sch_num', '4');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch2_bw');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch2_bw',value);
			};
			
			o = s.option(form.Value, "sch3_bw", _("sch3_bw"),_('(unit:Kbps)'));
			o.value('1000000', _("1000000 for 1gbps"));
			o.value('2500000', _("2500000 for 2.5gbps"));
			o.value('10000000', _("10000000 for 10gbps"));
			o.depends('sch_num', '4');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch3_bw');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch3_bw',value);
			};
		}
 
		return m.render();
	},
});

