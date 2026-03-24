'use strict';
'require view';
'require form';
'require rpc';
'require uci';

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

return view.extend({
	load: function() {
		return uci.load('advanced');
	},

	render: function() {
		let m = new form.Map('advanced');

		if (L.hasSystemFeature('wedoffload')) {
			let s = m.section(form.TypedSection, 'defaults', _('WED Offloading'),
				_('Wireless Ethernet Dispatch (WED) offloads part of the Wi-Fi data path in hardware. This can reduce CPU usage and improve routing throughput for wireless clients. Applying changes reprobes the mt7915e driver, causing a brief Wi-Fi interruption.'));
			let o;

			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.ListValue, 'wed_enable', _('Enable WED'));
			o.value('0', _('Off'));
			o.value('1', _('On'));
			o.optional = false;
			o.load = async function() {
				return (await callGetWED()) ? '1' : '0';
			};
			o.write = async function(section_id, value) {
				if (value !== '0' && value !== '1')
					return;

				const ret = await callSetWED(value == '1');
				if (!ret) {
					uci.unset('advanced', section_id, 'wed_offloading');
					return '0';
				}

				uci.set('advanced', section_id, 'wed_offloading', '1');
				return '1';
			};
		}

		return m.render();
	},
});
