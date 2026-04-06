'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('advanced'),
			L.resolveDefault(fs.trimmed('/sys/kernel/debug/cake_mq/sync_time_ns'), '')
		]);
	},

	render: function(data) {
		var runtimeValue = data[1] || '800000';
		var m = new form.Map('advanced');
		var s = m.section(form.TypedSection, 'defaults', _('CAKE Settings'),
			_('Configure the cake_mq sync_time value exposed by the kernel debugfs knob. The vanilla OpenWrt value is 200000 ns. The value is stored in /etc/config/advanced for persistence and applied through advanced_setup when you use Save & Apply. The menu is shown only when /sys/kernel/debug/cake_mq/sync_time_ns is available.'));
		var o;

		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'cake_sync_time_ns', _('sync_time (ns)'),
			_('Runtime value for /sys/kernel/debug/cake_mq/sync_time_ns. Vanilla OpenWrt uses 200000 ns; typical test values here are 600000 or 800000. Use 0 only for short diagnostic tests.'));
		o.datatype = 'uinteger';
		o.placeholder = '800000';
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			return uci.get('advanced', section_id, 'cake_sync_time_ns') || runtimeValue || '800000';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'cake_sync_time_ns', value);
		};

		return m.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			return fs.exec('/etc/init.d/advanced_setup', [ 'reload', 'cake' ]);
		}).then(function() {
			return ui.changes.apply(mode == '0');
		});
	}
});
