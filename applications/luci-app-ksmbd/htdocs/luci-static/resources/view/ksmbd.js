'use strict';
'require view';
'require fs';
'require form';
'require rpc';
'require uci';
'require ui';
'require tools.widgets as widgets';

var callUserList = rpc.declare({
	object: 'luci.ksmbd',
	method: 'list',
	expect: { }
});

var callUserAdd = rpc.declare({
	object: 'luci.ksmbd',
	method: 'add',
	params: [ 'name', 'password' ]
});

var callUserPasswd = rpc.declare({
	object: 'luci.ksmbd',
	method: 'passwd',
	params: [ 'name', 'password' ]
});

var callUserDelete = rpc.declare({
	object: 'luci.ksmbd',
	method: 'delete',
	params: [ 'name' ]
});

// Shares added at runtime (ksmbd-autoshare, ksmbd-hotplug) are kept in
// /var/run/config/ksmbd, which rpcd's uci does not see
var RUNTIME_CONFIG = '/var/run/config/ksmbd';

function parseRuntimeShares(data) {
	var shares = [], s = null;

	(data || '').split('\n').forEach(function(line) {
		var m = line.match(/^\s*config\s+(\S+)(?:\s+'?([^'\s]+)'?)?/);

		if (m) {
			s = (m[1] == 'share') ? { sid: m[2], opts: {} } : null;
			if (s)
				shares.push(s);
		}
		else if (s && (m = line.match(/^\s*option\s+(\S+)\s+(?:'((?:[^']|'\\'')*)'|(\S+))\s*$/))) {
			s.opts[m[1]] = (m[2] != null) ? m[2].replace(/'\\''/g, "'") : m[3];
		}
	});

	return shares;
}

// Replace some options of one section, keeping the rest of the file as is
function setRuntimeOptions(data, sid, values) {
	var out = [], cur = null;

	function flush() {
		var blank = [];

		if (cur != sid)
			return;

		while (out.length && out[out.length - 1].trim() == '')
			blank.unshift(out.pop());

		for (var opt in values)
			if (values[opt] != null && values[opt] !== '')
				out.push('\toption ' + opt + " '" + String(values[opt]).replace(/'/g, "'\\''") + "'");

		out.push.apply(out, blank);
	}

	(data || '').split('\n').forEach(function(line) {
		var m = line.match(/^\s*config\s+\S+(?:\s+'?([^'\s]+)'?)?/);

		if (m) {
			flush();
			cur = m[1];
		}
		else if (cur == sid && (m = line.match(/^\s*option\s+(\S+)/)) && m[1] in values) {
			return;
		}

		out.push(line);
	});
	flush();

	return out.join('\n');
}

function yesNo(value, dflt) {
	return /^(1|yes|on|true|enabled)$/.test(value != null ? value : dflt) ? _('Yes') : _('No');
}

function stripSlash(path) {
	return (path || '').replace(/\/+$/, '');
}

// The ksmbd init script skips a runtime share when a configured share
// has the same name or path
function isConfigured(share) {
	return uci.sections('ksmbd', 'share').some(function(s) {
		return (s.name != null && s.name == share.opts.name) ||
			(s.path != null && stripSlash(s.path) == stripSlash(share.opts.path));
	});
}

function editRuntimeShare(ctx, share) {
	var m = new form.JSONMap({ share: Object.assign({}, share.opts) }),
	    s = m.section(form.NamedSection, 'share', 'share'),
	    o;

	o = s.option(form.Value, 'name', _('Name'));
	o.rmempty = false;

	o = s.option(form.Value, 'path', _('Path'));
	o.readonly = true;

	o = s.option(form.Flag, 'browseable', _('Browse-able'));
	o.enabled = 'yes';
	o.disabled = 'no';
	o.default = 'yes';

	o = s.option(form.Flag, 'read_only', _('Read-only'));
	o.enabled = 'yes';
	o.disabled = 'no';
	o.default = 'yes'; // ksmbd.conf default

	o = s.option(form.Flag, 'guest_ok', _('Allow guests'));
	o.enabled = 'yes';
	o.disabled = 'no';
	o.default = 'no'; // ksmbd.conf default

	s.option(form.Value, 'users', _('Allowed users'));

	s.option(form.Flag, 'force_root', _('Force Root'));

	function formValues() {
		var values = {};

		[ 'name', 'browseable', 'read_only', 'guest_ok', 'users', 'force_root' ].forEach(function(opt) {
			values[opt] = L.toArray(m.lookupOption(opt, 'share'))[0].formvalue('share');
		});

		if (!values.name)
			values.name = share.opts.name;

		return values;
	}

	// Change the runtime share, it is gone once the device is unplugged
	function applyRuntime() {
		var values = formValues();

		return fs.read(RUNTIME_CONFIG).then(function(data) {
			if (!parseRuntimeShares(data).some(function(s) { return s.sid == share.sid }))
				throw new Error(_('The device has been unplugged'));

			return fs.write(RUNTIME_CONFIG, setRuntimeOptions(data, share.sid, values));
		}).then(function() {
			return fs.exec('/etc/init.d/ksmbd', [ 'reload' ]);
		}).then(function() {
			for (var opt in values) {
				if (values[opt] !== '')
					share.opts[opt] = values[opt];
				else
					delete share.opts[opt];
			}

			ui.hideModal();
			ctx.refresh();
		}).catch(function(err) {
			ui.addNotification(null, E('p', err.message), 'error');
		});
	}

	// Copy it to /etc/config/ksmbd, which wins over the runtime share.
	// The share is added from the save callback, after the form has been
	// parsed: parsing drops the options of sections it has not loaded yet.
	function savePermanent() {
		var values = Object.assign({}, share.opts, formValues());

		ui.hideModal();

		return ctx.map.save(function() {
			var sid = uci.add('ksmbd', 'share');

			for (var opt in values)
				if (values[opt] != null && values[opt] !== '')
					uci.set('ksmbd', sid, opt, values[opt]);
		}, true).then(function() {
			ctx.refresh();
			ui.changes.apply(true);
		}).catch(function(err) {
			ui.addNotification(null, E('p', err.message), 'error');
		});
	}

	return m.render().then(function(node) {
		ui.showModal(_('Edit share'), [
			node,
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				share.sid ? E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(null, applyRuntime)
				}, _('Apply until unplugged')) : '', ' ',
				E('button', {
					'class': 'cbi-button cbi-button-positive important',
					'click': ui.createHandlerFn(null, savePermanent)
				}, _('Save permanently'))
			])
		], 'cbi-modal');
	});
}

function updateRuntimeShares(ctx) {
	cbi_update_table(ctx.table, ctx.shares.map(function(share) {
		// ksmbd.conf defaults: read only = yes, guest ok = no
		return [
			share.opts.name,
			share.opts.path,
			yesNo(share.opts.read_only, 'yes'),
			yesNo(share.opts.guest_ok, 'no'),
			isConfigured(share) ? E('em', _('Configured')) : E('button', {
				'class': 'cbi-button cbi-button-edit',
				'click': ui.createHandlerFn(null, editRuntimeShare, ctx, share)
			}, _('Edit'))
		];
	}), _('No automatic shares'));
}

function renderRuntimeShares(map, data) {
	var ctx = {
		map: map,
		shares: parseRuntimeShares(data),
		table: E('table', { 'class': 'table cbi-section-table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Name')),
				E('th', { 'class': 'th' }, _('Path')),
				E('th', { 'class': 'th' }, _('Read-only')),
				E('th', { 'class': 'th' }, _('Allow guests')),
				E('th', { 'class': 'th cbi-section-actions' })
			])
		])
	};

	ctx.refresh = function() {
		updateRuntimeShares(ctx);
	};
	ctx.refresh();

	return E('div', { 'class': 'cbi-section cbi-tblsection' }, [
		E('h3', _('Automatic shares')),
		E('div', { 'class': 'cbi-section-descr' },
			_('Shares added at runtime for removable devices, e.g. by ksmbd-autoshare. They are not stored in /etc/config/ksmbd and are removed when the device is unplugged. Edit a share to change it until the device is unplugged or to save it permanently.')),
		ctx.table
	]);
}

function checkResult(res) {
	if (!res || !res.result)
		throw new Error((res && res.error) || _('Unknown error'));
}

// Add a user (name == null) or change the password of an existing one
function editUser(ctx, name) {
	var m = new form.JSONMap({ user: { name: name || '' } }),
	    s = m.section(form.NamedSection, 'user', 'user'),
	    o;

	function required(section_id, value) {
		return (value != '') ? true : _('Expecting: %s').format(_('non-empty value'));
	}

	o = s.option(form.Value, 'name', _('Username'));
	o.readonly = (name != null);
	o.validate = required;

	o = s.option(form.Value, 'password', _('Password'));
	o.password = true;
	o.validate = required;

	o = s.option(form.Value, 'confirm', _('Confirmation'));
	o.password = true;
	o.validate = function(section_id, value) {
		return (value == this.section.formvalue(section_id, 'password')) ? true : _('Passwords do not match');
	};

	function save() {
		var opts = [ 'name', 'password', 'confirm' ].map(function(opt) {
			var o = L.toArray(m.lookupOption(opt, 'user'))[0];

			o.triggerValidation('user');
			return o;
		});

		// Invalid fields are highlighted in the dialog
		if (!opts.every(function(o) { return o.isValid('user') }))
			return;

		var user = opts[0].formvalue('user'),
		    password = opts[1].formvalue('user');

		return (name != null ? callUserPasswd(user, password) : callUserAdd(user, password))
			.then(checkResult)
			.then(ctx.refresh)
			.then(ui.hideModal)
			.catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', err.message), 'error');
			});
	}

	return m.render().then(function(node) {
		ui.showModal(name != null ? _('Change password') : _('Add user'), [
			node,
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					'class': 'cbi-button cbi-button-positive important',
					'click': ui.createHandlerFn(null, save)
				}, _('Save'))
			])
		], 'cbi-modal');
	});
}

function deleteUser(ctx, name) {
	if (!confirm(_('Delete the user %s?').format(name)))
		return;

	return callUserDelete(name)
		.then(checkResult)
		.then(ctx.refresh)
		.catch(function(err) {
			ui.addNotification(null, E('p', err.message), 'error');
		});
}

function renderUsers(users) {
	var ctx = {
		users: L.toArray(users),
		table: E('table', { 'class': 'table cbi-section-table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Username')),
				E('th', { 'class': 'th cbi-section-actions' })
			])
		])
	};

	function update() {
		cbi_update_table(ctx.table, ctx.users.map(function(name) {
			return [
				name,
				E('div', {}, [
					E('button', {
						'class': 'cbi-button cbi-button-edit',
						'click': ui.createHandlerFn(null, editUser, ctx, name)
					}, _('Change password')), ' ',
					E('button', {
						'class': 'cbi-button cbi-button-remove',
						'click': ui.createHandlerFn(null, deleteUser, ctx, name)
					}, _('Delete'))
				])
			];
		}), _('No users'));
	}

	ctx.refresh = function() {
		return callUserList().then(function(res) {
			ctx.users = L.toArray(res.users);
			update();
		});
	};
	update();

	return E('div', { 'class': 'cbi-section cbi-tblsection' }, [
		E('h3', _('Users')),
		E('div', { 'class': 'cbi-section-descr' },
			_('Users that can log in to the shares. Shares without guest access need at least one user; "Allowed users" limits a share to the listed ones.')),
		ctx.table,
		E('div', { 'class': 'cbi-section-create' }, [
			E('button', {
				'class': 'cbi-button cbi-button-add',
				'click': ui.createHandlerFn(null, editUser, ctx, null)
			}, _('Add user'))
		])
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.stat('/sbin/block'), null),
			L.resolveDefault(fs.stat('/etc/config/fstab'), null),
			L.resolveDefault(fs.exec('/usr/sbin/ksmbd.mountd', ['-V']), {}).then(function(res) { return L.toArray((res.stdout || '').match(/version : (\S+)/))[1] }),
			L.resolveDefault(fs.exec('/sbin/modinfo', ['ksmbd']), {}).then(function(res) { return L.toArray((res.stdout || '').match(/vermagic:\t(\S+)/))[1] }),
			L.resolveDefault(fs.read(RUNTIME_CONFIG), null),
			L.resolveDefault(callUserList(), {}),
		]);
	},
	render: function(stats) {
		var m, s, o, v, v2;
		v = '?';
		v2 = '?';

		m = new form.Map('ksmbd', _('Network Shares'));

		if (stats[2])
			v = stats[2].trim();
		if (stats[3])
			v2 = stats[3].trim();
		if (v != v2)
			v = v +'/'+ v2;
		s = m.section(form.TypedSection, 'globals', 'Ksmbd/Kmod Version ' + v);
		s.anonymous = true;

		s.tab('general',  _('General Settings'));
		s.tab('template', _('Edit Template'), _('Edit the template that is used for generating the ksmbd configuration.'));

		o = s.taboption('general', widgets.NetworkSelect, 'interface', _('Interface'),
			_('Listen only on the given interface or, if unspecified, on lan'));
		o.multiple = true;
		o.cfgvalue = (section_id => L.toArray(uci.get('ksmbd', section_id, 'interface')));
		o.write = function(section_id, formvalue) {
			var cfgvalue = this.cfgvalue(section_id),
			    oldNetworks = L.toArray(cfgvalue),
			    newNetworks = L.toArray(formvalue);
			oldNetworks.sort();
			newNetworks.sort();
			if (oldNetworks.join(' ') == newNetworks.join(' '))
				return;
			return uci.set('ksmbd', section_id, 'interface', newNetworks.join(' '));
		};

		o = s.taboption('general', form.Value, 'workgroup', _('Workgroup'));
		o.placeholder = 'WORKGROUP';

		o = s.taboption('general', form.Value, 'description', _('Description'));
		o.placeholder = 'Ksmbd on OpenWrt';
		
		o = s.taboption('general', form.Flag, 'allow_guest_ipc', _('Allow guest on IPC$.'),
			_('Add optional guest access to IPC$ share, disabled by default'));

		o = s.taboption('general', form.Flag, 'allow_legacy_protocols', _('Allow legacy (insecure) protocols/authentication.'),
			_('Allow legacy smb(v1)/Lanman connections, needed for older devices without smb(v2.1/3) support.'));

		o = s.taboption('template', form.TextValue, '_tmpl',
			null,
			_("This is the content of the file '/etc/ksmbd/ksmbd.conf.template' from which your ksmbd configuration will be generated. \
			Values enclosed by pipe symbols ('|') should not be changed. They get their values from the 'General Settings' tab."));
		o.rows = 20;
		o.cfgvalue = function(section_id) {
			return fs.trimmed('/etc/ksmbd/ksmbd.conf.template');
		};
		o.write = function(section_id, formvalue) {
			return fs.write('/etc/ksmbd/ksmbd.conf.template', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
		};


		s = m.section(form.TableSection, 'share', _('Shared Directories'),
			_('Please add directories to share. Each directory refers to a folder on a mounted device.'));
		s.anonymous = true;
		s.addremove = true;

		s.option(form.Value, 'name', _('Name'));
		o = s.option(form.Value, 'path', _('Path'));
		if (stats[0] && stats[1]) {
			o.titleref = L.url('admin', 'system', 'mounts');
		}

		o = s.option(form.Flag, 'browseable', _('Browse-able'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'yes';

		o = s.option(form.Flag, 'read_only', _('Read-only'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'no'; // ksmbd.conf default is 'yes'
		o.rmempty = false;

		s.option(form.Flag, 'force_root', _('Force Root'));

		o = s.option(form.Value, 'users', _('Allowed users'));
		o.rmempty = true;

		o = s.option(form.Flag, 'guest_ok', _('Allow guests'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'yes'; // ksmbd.conf default is 'no'
		o.rmempty = false;

		o = s.option(form.Flag, 'inherit_owner', _('Inherit owner'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'no';

		o = s.option(form.Flag, 'hide_dot_files', _('Hide dot files'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'yes';

		o = s.option(form.Value, 'create_mask', _('Create mask'));
		o.maxlength = 4;
		o.default = '0666'; // ksmbd.conf default is '0744'
		o.placeholder = '0666';
		o.rmempty = false;

		o = s.option(form.Value, 'dir_mask', _('Directory mask'));
		o.maxlength = 4;
		o.default = '0777'; // ksmbd.conf default is '0755'
		o.placeholder = '0777';
		o.rmempty = false;

		return m.render().then(function(node) {
			var nodes = [ node ];

			// Only when the file exists, i.e. a runtime share was added since boot
			if (stats[4] != null)
				nodes.push(renderRuntimeShares(m, stats[4]));

			nodes.push(renderUsers(stats[5].users));

			// Kept outside the map node, which is rebuilt on save
			return E('div', {}, nodes);
		});
	}
});
