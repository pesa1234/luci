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

		s = m.section(form.TypedSection, 'defaults', _('USB setting'),
			_('This settings force the USB speed to 2.0 in case your device interfere with 2.4 ghz WiFi.'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.ListValue, "usb_2", _("Force USB to 2.0 speed"));
		o.value('0', _("Off"));
		o.value('1', _("On"));
		o.optional = false;
		o.default = uci.get('advanced', 'defaults', 'usb_2');
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'usb_2', value);
			fs.exec('/etc/init.d/advanced_setup', ['start']);
		};

		return m.render();
	},
});
