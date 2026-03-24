'use strict';
'require view';
'require form';
'require fs';
'require uci';

return view.extend({
	load: function() {
		return uci.load('advanced');
	},

	render: function() {
		let m = new form.Map('advanced');

		if (L.hasSystemFeature('vow')) {
			let description = _('Airtime Fairness (ATF) allocates Wi-Fi airtime more evenly across clients, helping prevent slower devices from monopolizing the channel. Enabling ATF also switches mt7915e to the legacy 5.4-style Airtime Fairness mode, which requires reprobe of the mt7915e driver and causes a brief Wi-Fi interruption while changes are applied. Weighted Airtime Fairness (WATF), also referred to by MediaTek as HW-ATF, adjusts airtime quantums on top of ATF.');
			let s, o;

			s = m.section(form.TypedSection, 'defaults', _('Airtime Fairness (ATF)'), description);
			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.ListValue, 'atf_enable', _('Enable Airtime Fairness (ATF)'));
			o.value('0', _('Off'));
			o.value('1', _('On'));
			o.optional = false;
			o.default = uci.get('advanced', 'defaults', 'atf_enable') || '0';
			o.write = function(section_id, value) {
				uci.set('advanced', section_id, 'atf_enable', value);
				if (value != '1')
					uci.set('advanced', section_id, 'hw_atf_enable', '0');

				fs.exec('/etc/init.d/advanced_setup', [ 'reload', 'atf' ])
					.then(() => console.log('advanced_setup reload atf done'))
					.catch(err => console.error(err));
			};

			o = s.option(form.ListValue, 'hw_atf_enable', _('Enable Weighted Airtime Fairness (WATF)'),
				_('Weighted Airtime Fairness (WATF), also referred to by MediaTek as HW-ATF, builds on Airtime Fairness (ATF) by applying airtime quantum levels.'));
			o.value('0', _('Off'));
			o.value('1', _('On'));
			o.optional = false;
			o.default = uci.get('advanced', 'defaults', 'hw_atf_enable') || '0';
			o.depends('atf_enable', '1');
			o.write = function(section_id, value) {
				uci.set('advanced', section_id, 'hw_atf_enable', value);
				fs.exec('/etc/init.d/advanced_setup', [ 'reload', 'atf' ])
					.then(() => console.log('advanced_setup reload atf done'))
					.catch(err => console.error(err));
			};
		}

		return m.render();
	},
});
