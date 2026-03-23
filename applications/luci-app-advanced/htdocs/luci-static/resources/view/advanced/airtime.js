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
			let description = _('Airtime Fairness (ATF) distributes channel airtime more evenly between clients. Enabling ATF also switches mt7915e to the legacy 5.4-style Airtime Fairness exposure on the next boot, so a reboot is required for the driver change to fully take effect. Hardware ATF can be enabled only when ATF is enabled.');
			let s, o;

			s = m.section(form.TypedSection, 'defaults', _('Airtime Fairness'), description);
			s.anonymous = true;
			s.addremove = false;

			o = s.option(form.ListValue, 'atf_enable', _('Enable ATF'));
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

			o = s.option(form.ListValue, 'hw_atf_enable', _('Enable HW ATF'),
				_('Hardware ATF is available only when ATF is enabled.'));
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
