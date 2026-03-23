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
		]).catch(err => {
			console.error('Error loading resources:', err);
		});
	},
	
	render: function() {

		let m, s, o;

		m = new form.Map('advanced');

		
		/* HQoS specific Hardware Quality of Service */
		
 		if (L.hasSystemFeature('hqos')) {
			
		
			s = m.section(form.TypedSection, 'defaults', _('Hardware QoS (HQoS)'),
				_('Configure MediaTek hardware QoS offload. This page exposes the main controls, while the full configuration remains available in /etc/config/mtkhnat.'));
			s.anonymous = true;
			s.addremove = false;
			o = s.option(form.ListValue, "enable", _("Enable mtkhnat Utility"));
			o.value('0', _("Off"));
			o.value('1', _("On"));
			o.optional = false;
			o.default = uci.get('mtkhnat', 'global', 'enable');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'enable',value);
			};
		
			o = s.option(form.ListValue, "hqos", _("Enable HQoS"), _('Enable or disable hardware QoS offload.'));
			o.value('0', _("Off"));
			o.value('1', _("On"));
			o.depends('enable', '1');
			o.optional = false;
			o.default = uci.get('mtkhnat', 'global', 'hqos');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'hqos',value);
				fs.exec_direct('/sbin/mtkhnat');
			};
			
			o = s.option(form.ListValue, "hqos_type", _("HQoS Mode"), _('0: Disabled. 1: HQoS. 2: Per-port per-queue mode.'));
			o.value('0', _("Disabled"));
			o.value('1', _("HQoS"));
			o.value('2', _("PPPQ"));
			o.depends('enable', '1');
			o.optional = false;
			o.default = uci.get('mtkhnat', 'global', 'hqos_type');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'hqos_type',value);
			};
			
			o = s.option(form.ListValue, "txq_num", _("TX Queue Count"), _('Default: 16.'));
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
			
			o = s.option(form.ListValue, "sch_num", _("Scheduler Count"), _('Number of schedulers to use: 2 or 4.'));
			o.value('2', _("2"));
			o.value('4', _("4"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch_num');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch_num',value);
			};
			
			o = s.option(form.ListValue, "scheduling", _("Scheduling Policy"), _('WRR: weighted round-robin. SP: strict priority.'));
			o.value('wrr', _("wrr"));
			o.value('sp', _("sp"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'scheduling');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'scheduling',value);
			};
			
			o = s.option(form.Value, "sch0_bw", _("Scheduler 0 Bandwidth"), _('Bandwidth in Kbps.'));
			o.value('1000000', _("1000000 for 1gbps"));
			o.value('2500000', _("2500000 for 2.5gbps"));
			o.value('10000000', _("10000000 for 10gbps"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch0_bw');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch0_bw',value);
			};
			
			o = s.option(form.Value, "sch1_bw", _("Scheduler 1 Bandwidth"), _('Bandwidth in Kbps.'));
			o.value('1000000', _("1000000 for 1gbps"));
			o.value('2500000', _("2500000 for 2.5gbps"));
			o.value('10000000', _("10000000 for 10gbps"));
			o.depends('enable', '1');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch1_bw');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch1_bw',value);
			};
			
			o = s.option(form.Value, "sch2_bw", _("Scheduler 2 Bandwidth"), _('Bandwidth in Kbps.'));
			o.value('1000000', _("1000000 for 1gbps"));
			o.value('2500000', _("2500000 for 2.5gbps"));
			o.value('10000000', _("10000000 for 10gbps"));
			o.depends('sch_num', '4');
			o.datatype = 'uinteger';
			o.default = uci.get('mtkhnat', 'global', 'sch2_bw');
			o.write = function(section_id, value) {
				uci.set('mtkhnat', 'global', 'sch2_bw',value);
			};
			
			o = s.option(form.Value, "sch3_bw", _("Scheduler 3 Bandwidth"), _('Bandwidth in Kbps.'));
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
