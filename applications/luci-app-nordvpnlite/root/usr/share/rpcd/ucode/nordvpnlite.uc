'use strict';

const CONFIG_FILE = '/etc/nordvpnlite/config.json';
const INIT_SCRIPT = '/etc/init.d/nordvpnlite';
const SERVICE_NAME = 'nordvpnlite';
const SERVERS_API_URL = 'https://api.nordvpn.com/v1/servers?limit=20000';
const VALID_ACTIONS = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];
let fs = require('fs');
let log = require('log');

function has_service() {
	let st = fs.stat(INIT_SCRIPT);
	return st && st.type == 'file' && st.perm && st.perm.user_exec;
}

function service_action(action) {
	return system(sprintf('env -i %s %s >/dev/null 2>&1', INIT_SCRIPT, action));
}

function shell_quote(value) {
	if (value == null || value == '')
		return "''";

	return "'" + replace(value, "'", "'\\''") + "'";
}

function has_command(command) {
	return system(sprintf('command -v %s >/dev/null 2>&1', command)) == 0;
}

function read_command_output(command) {
	let pp = fs.popen(command, 'r');
	if (!pp)
		return null;

	let output = pp.read('all');
	let exit_code = pp.close();

	if (exit_code != 0 || output == null)
		return null;

	return trim(output);
}

function fetch_servers_index() {
	let url = shell_quote(SERVERS_API_URL);
	let commands = [];

	if (has_command('curl'))
		push(commands, 'curl -sS ' + url + ' 2>/dev/null');

	if (has_command('uclient-fetch'))
		push(commands, 'uclient-fetch -qO- ' + url + ' 2>/dev/null');

	if (has_command('wget'))
		push(commands, 'wget -qO- ' + url + ' 2>/dev/null');

	if (!length(commands)) {
		log.ERR('No HTTP client found for NordVPN API lookup');
		return [null, 'No supported HTTP client found (curl, uclient-fetch or wget).'];
	}

	for (let command in commands) {
		let output = read_command_output(command);

		if (!output)
			continue;

		try {
			return [json(output), null];
		} catch (e) {
			log.ERR('Failed to parse NordVPN API response: %J', e);
		}
	}

	return [null, 'Unable to download or parse NordVPN server list.'];
}

function extract_public_key(technologies) {
	for (let technology in technologies || []) {
		if (technology?.identifier != 'wireguard_udp')
			continue;

		for (let meta in technology.metadata || []) {
			if (meta?.name == 'public_key' && meta?.value)
				return meta.value;
		}
	}

	return null;
}

return {
	nordvpnlite: {
		get_config: {
			call: function() {
				let content = null;
				try {
					content = json(fs.readfile(CONFIG_FILE));
				} catch (e) {
					log.ERR("Failed to read config file: %J", e);
				}
				return { config: content };
			}
		},

		set_config: {
			args: { config: {} },
			call: function(req) {
				const tmp = CONFIG_FILE + '.tmp';
				if (fs.writefile(tmp, sprintf('%.2J', req.args.config)) == null) {
					log.ERR("Failed to write temp file");
					fs.unlink(tmp);
					return { success: false, error: fs.error() };
				}
				if (fs.rename(tmp, CONFIG_FILE) == null) {
					log.ERR("Failed to move temp file");
					fs.unlink(tmp);
					return { success: false, error: fs.error() };
				}
				return { success: true };
			}
		},

		get_service_status: {
			call: function() {
				if (!has_service()) {
					return {
						installed: false,
						enabled: false,
						running: false
					};
				}

				return {
					installed: true,
					enabled: service_action('enabled') == 0,
					running: service_action('running') == 0
				};
			}
		},

		set_service_action: {
			args: { action: 'action' },
			call: function(req) {
				let action = req?.args?.action;

				if (index(VALID_ACTIONS, action) < 0) {
					return {
						success: false,
						error: sprintf('Invalid action: %s', action || '')
					};
				}

				if (!has_service()) {
					return {
						success: false,
						error: sprintf('Init script not found: %s', INIT_SCRIPT)
					};
				}

				let result = service_action(action);

				return {
					success: result == 0,
					action: action,
					exit_code: result,
					service: SERVICE_NAME
				};
			}
		},

		get_server_data: {
			args: { hostname: 'hostname' },
			call: function(req) {
				let hostname = trim(req?.args?.hostname || '');

				if (hostname == '') {
					return {
						success: false,
						error: 'Server hostname is required.'
					};
				}

				let [servers, fetch_error] = fetch_servers_index();

				if (fetch_error || !servers) {
					return {
						success: false,
						error: fetch_error || 'Unable to query NordVPN API.'
					};
				}

				for (let server in servers) {
					if (lc(server?.hostname || '') != lc(hostname))
						continue;

					let public_key = extract_public_key(server.technologies || []);

					if (!public_key) {
						return {
							success: false,
							error: sprintf('No WireGuard public key found for %s.', hostname)
						};
					}

					return {
						success: true,
						hostname: server.hostname,
						address: server.station,
						public_key: public_key
					};
				}

				return {
					success: false,
					error: sprintf('Server not found: %s', hostname)
				};
			}
		}
	}
};
