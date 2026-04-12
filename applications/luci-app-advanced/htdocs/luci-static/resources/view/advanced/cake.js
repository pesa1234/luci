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
			_('Configure global CAKE-related defaults. sync_time controls how often cake_mq refreshes its shared queue state, while the IFB queue policy controls how many TX queues sqm-scripts creates for ingress shaping when SQM uses multiqueue. For most setups, start with sync_time = 200000 ns and IFB queues = Half of cores.'));
		var o;

		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'cake_sync_time_ns', _('sync_time (ns)'),
			_('Runtime value for /sys/kernel/debug/cake_mq/sync_time_ns. Lower values react faster to queue changes but cost more CPU time. 200000 ns is the recommended starting point with the optimized cake_mq patches; higher values such as 600000 or 800000 are mainly fallback or diagnostic settings. Use 0 only for short tests.'));
		o.datatype = 'uinteger';
		o.placeholder = '800000';
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			return uci.get('advanced', section_id, 'cake_sync_time_ns') || runtimeValue || '800000';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'cake_sync_time_ns', value);
		};

		o = s.option(form.ListValue, 'cake_ifb_tx_queues_mode', _('IFB ingress TX queues'),
			_('Select how many TX queues sqm-scripts should create on ingress IFB devices when use_mq is enabled. `1` creates a single-queue IFB and effectively keeps download shaping on plain cake. `Half of cores` is the recommended balance between throughput and CPU cost. `All cores` creates one IFB TX queue per CPU core and is best reserved for testing, because some targets lose download speed when too many IFB queues are active. After changing this option, restart SQM so the IFB device is recreated with the new queue count.'));
		o.value('1', _('1'));
		o.value('half', _('Half of cores (Default)'));
		o.value('all', _('All cores'));
		o.default = 'half';
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			return uci.get('advanced', section_id, 'cake_ifb_tx_queues_mode') || 'half';
		};
		o.write = function(section_id, value) {
			uci.set('advanced', section_id, 'cake_ifb_tx_queues_mode', value);
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
