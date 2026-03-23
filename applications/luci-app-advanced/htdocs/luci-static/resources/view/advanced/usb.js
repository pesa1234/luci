'use strict';
'require view';
'require uci';
'require fs';
'require form';

return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('advanced');

		s = m.section(form.TypedSection, 'defaults', _('USB Speed'),
			_('Force the USB controller to operate at USB 2.0 speed when USB 3.x devices cause interference on the 2.4 GHz band.'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.ListValue, 'usb_2', _('Force USB 2.0 Mode'));
		o.value('0', _('Off'));
		o.value('1', _('On'));
		o.optional = false;
		o.default = uci.get('advanced', 'defaults', 'usb_2') || '0';
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'usb_2', value);
			fs.exec("/etc/init.d/advanced_setup", ["reload", "usb"])
					  .then(() => console.log("advanced_setup reload USB done"))
					  .catch(err => console.error(err));
		};

		s = m.section(form.TypedSection, 'defaults', _('USB Power'),
			_('Enable or disable power on the USB port.'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.ListValue, 'usb_power', _('USB Port Power'));
		o.value('0', _('Off'));
		o.value('1', _('On'));
		o.optional = false;
		o.default = uci.get('advanced', 'defaults', 'usb_power') || '1';
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'usb_power', value);
			fs.exec("/etc/init.d/advanced_setup", ["reload", "usb"])
					  .then(() => console.log("advanced_setup reload USB done"))
					  .catch(err => console.error(err));
		};
		return m.render();
	},
});
