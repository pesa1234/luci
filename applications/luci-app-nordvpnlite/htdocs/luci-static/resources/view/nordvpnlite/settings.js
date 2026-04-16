'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var callGetConfig = rpc.declare({
    object: 'nordvpnlite',
    method: 'get_config'
});

var callSetConfig = rpc.declare({
    object: 'nordvpnlite',
    method: 'set_config',
    params: ['config']
});

var callGetServiceStatus = rpc.declare({
    object: 'nordvpnlite',
    method: 'get_service_status'
});

var callSetServiceAction = rpc.declare({
    object: 'nordvpnlite',
    method: 'set_service_action',
    params: ['action']
});

var callGetServerData = rpc.declare({
    object: 'nordvpnlite',
    method: 'get_server_data',
    params: ['hostname']
});

var defaultConfig = {
    authentication_token: '<REPLACE_WITH_YOUR_TOKEN>',
    vpn: 'recommended',
    log_level: 'error',
    log_file_path: '/var/log/nordvpnlite.log',
    log_file_count: 0,
    adapter_type: 'linux-native',
    interface: {
        name: 'nordvpnlite',
        max_route_priority: 6000,
        config_provider: 'uci'
    }
};

return view.extend({
    load: function () {
        return Promise.all([
            callGetConfig().then(function (result) {
                return result.config || defaultConfig;
            }),
            L.resolveDefault(callGetServiceStatus(), {
                installed: false,
                enabled: false,
                running: false
            })
        ]);
    },

    renderServicePanel: function (status) {
        var buttonStyle = 'margin-right:0.5rem; margin-bottom:0.25rem;';
        var enableStyle = buttonStyle + ' margin-left:1rem;';
        var statusText;

        if (!status.installed)
            statusText = _('Not installed or not found');
        else if (status.running)
            statusText = _('Running');
        else if (status.enabled)
            statusText = _('Stopped.');
        else
            statusText = _('Stopped (Disabled).');

        var btnStart = E('button', {
            'class': 'btn cbi-button cbi-button-apply',
            'type': 'button',
            'style': buttonStyle,
            'disabled': !status.installed || !status.enabled || status.running,
            'click': function (ev) {
                ev.preventDefault();
                return this.handleServiceAction('start');
            }.bind(this)
        }, _('Start'));

        var btnRestart = E('button', {
            'class': 'btn cbi-button cbi-button-apply',
            'type': 'button',
            'style': buttonStyle,
            'disabled': !status.installed || !status.enabled || !status.running,
            'click': function (ev) {
                ev.preventDefault();
                return this.handleServiceAction('restart');
            }.bind(this)
        }, _('Restart'));

        var btnStop = E('button', {
            'class': 'btn cbi-button cbi-button-reset',
            'type': 'button',
            'style': buttonStyle,
            'disabled': !status.installed || !status.enabled || !status.running,
            'click': function (ev) {
                ev.preventDefault();
                return this.handleServiceAction('stop');
            }.bind(this)
        }, _('Stop'));

        var btnEnable = E('button', {
            'class': 'btn cbi-button cbi-button-apply',
            'type': 'button',
            'style': enableStyle,
            'disabled': !status.installed || status.enabled,
            'click': function (ev) {
                ev.preventDefault();
                return this.handleServiceAction('enable');
            }.bind(this)
        }, _('Enable'));

        var btnDisable = E('button', {
            'class': 'btn cbi-button cbi-button-reset',
            'type': 'button',
            'style': buttonStyle,
            'disabled': !status.installed || !status.enabled,
            'click': function (ev) {
                ev.preventDefault();
                return this.handleServiceAction('disable');
            }.bind(this)
        }, _('Disable'));

        return E('div', { 'class': 'cbi-section' }, [
            E('div', { 'class': 'cbi-value' }, [
                E('label', { 'class': 'cbi-value-title' }, _('Service Status')),
                E('div', { 'class': 'cbi-value-field' }, E('div', {}, statusText))
            ]),
            E('div', { 'class': 'cbi-value' }, [
                E('label', { 'class': 'cbi-value-title' }, _('Service Control')),
                E('div', { 'class': 'cbi-value-field' }, E('div', {}, [
                    btnStart,
                    btnRestart,
                    btnStop,
                    btnEnable,
                    btnDisable
                ]))
            ])
        ]);
    },

    pollServiceStatus: function (expectRunning) {
        var attempts = 0;
        var maxAttempts = 30;

        var poll = function () {
            attempts++;

            return L.resolveDefault(callGetServiceStatus(), {}).then(function (status) {
                if ((expectRunning && status.running === true) || (!expectRunning && status.running !== true)) {
                    ui.hideModal();
                    location.reload();
                    return;
                }

                if (attempts >= maxAttempts) {
                    ui.hideModal();
                    location.reload();
                    return;
                }

                window.setTimeout(poll, 1000);
            }).catch(function () {
                if (attempts >= maxAttempts) {
                    ui.hideModal();
                    location.reload();
                    return;
                }

                window.setTimeout(poll, 1000);
            });
        };

        window.setTimeout(poll, 1000);
    },

    handleServiceAction: function (action) {
        var messages = {
            start: _('Starting NordVPN Lite service'),
            restart: _('Restarting NordVPN Lite service'),
            stop: _('Stopping NordVPN Lite service'),
            enable: _('Enabling NordVPN Lite service'),
            disable: _('Disabling NordVPN Lite service')
        };

        ui.showModal(null, [
            E('p', { 'class': 'spinning' }, messages[action] || _('Updating NordVPN Lite service'))
        ]);

        return callSetServiceAction(action).then(function (res) {
            if (!res || res.success !== true) {
                ui.hideModal();
                ui.addNotification(_('Action failed'), E('p', (res && res.error) ? String(res.error) : _('Could not control the service.')));
                return;
            }

            if (action === 'start' || action === 'restart')
                return this.pollServiceStatus(true);

            if (action === 'stop')
                return this.pollServiceStatus(false);

            ui.hideModal();
            location.reload();
        }.bind(this)).catch(function (err) {
            ui.hideModal();
            ui.addNotification(_('Action failed'), E('p', err ? String(err) : _('Unknown error')));
        });
    },

    getVpnFormData: function (config) {
        var data = {
            authentication_token: config.authentication_token === '<REPLACE_WITH_YOUR_TOKEN>' ? '' : String(config.authentication_token || ''),
            vpn_mode: 'recommended',
            vpn_country: '',
            server_hostname: '',
            server_address: '',
            server_public_key: ''
        };

        if (config.vpn && config.vpn !== 'recommended') {
            if (config.vpn.country != null) {
                data.vpn_mode = 'country';
                data.vpn_country = String(config.vpn.country || '');
            } else if (config.vpn.server != null) {
                data.vpn_mode = 'server';
                data.server_hostname = String(config.vpn.server.hostname || '');
                data.server_address = String(config.vpn.server.address || '');
                data.server_public_key = String(config.vpn.server.public_key || '');
            }
        }

        return data;
    },

    setOptionValue: function (option, value) {
        var node = document.getElementById(option.cbid('config'));

        if (!node)
            return;

        node.value = value != null ? String(value) : '';
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
    },

    handleGetServerData: function () {
        var hostname = String(this.server_hostname_option.formvalue('config') || '').trim();

        if (hostname === '') {
            ui.addNotification(_('Lookup failed'), E('p', _('Please enter a server hostname first.')));
            return Promise.resolve();
        }

        if (!this.server_hostname_option.isValid('config')) {
            ui.addNotification(_('Lookup failed'), E('p', _('Please provide a valid server hostname.')));
            return Promise.resolve();
        }

        ui.showModal(null, [
            E('p', { 'class': 'spinning' }, _('Fetching NordVPN server data'))
        ]);

        return callGetServerData(hostname).then(function (res) {
            ui.hideModal();

            if (!res || res.success !== true) {
                ui.addNotification(_('Lookup failed'), E('p', (res && res.error) ? String(res.error) : _('Unable to fetch NordVPN server data.')));
                return;
            }

            this.setOptionValue(this.server_hostname_option, res.hostname || hostname);
            this.setOptionValue(this.server_address_option, res.address || '');
            this.setOptionValue(this.server_public_key_option, res.public_key || '');

            ui.addNotification(_('Server data loaded'), E('p', _('Server IP address and public key have been filled in.')));
        }.bind(this)).catch(function (err) {
            ui.hideModal();
            ui.addNotification(_('Lookup failed'), E('p', err ? String(err) : _('Unknown error')));
        });
    },

    render: function (data) {
        var config = data[0];
        var serviceStatus = data[1] || {
            installed: false,
            enabled: false,
            running: false
        };
        var view = this;

        this.config = config;
        this.serviceStatus = serviceStatus;

        var form_data = {
            config: this.getVpnFormData(this.config)
        };

        var m = new form.JSONMap(form_data, _('NordVPN Lite'),
            _('Configure your NordVPN Lite connection settings.'));

        var s = m.section(form.NamedSection, 'config');

        var o = this.authentication_token_option = s.option(form.Value, 'authentication_token', _('Authentication Token'));
        o.password = true;
        o.placeholder = _('Enter your Nord Account authentication token');

        o = this.vpn_mode_option = s.option(form.ListValue, 'vpn_mode', _('VPN Selection'));
        o.value('recommended', _('Recommended server'));
        o.value('country', _('Country code'));
        o.value('server', _('Specific server'));
        o.rmempty = false;

        o = this.vpn_country_option = s.option(form.Value, 'vpn_country', _('Country Code'));
        o.depends('vpn_mode', 'country');
        o.placeholder = _('US');
        o.description = _('Enter a two-letter country code (e.g., US, DE, GB).');
        o.validate = function (_, value) {
            if (view.vpn_mode_option.formvalue('config') !== 'country')
                return true;

            value = String(value || '').trim();
            return value.length === 2 ? true : _('Please provide a two-letter country code.');
        };

        o = this.server_hostname_option = s.option(form.Value, 'server_hostname', _('Server Hostname'));
        o.depends('vpn_mode', 'server');
        o.datatype = 'hostname';
        o.placeholder = _('uk1904.nordvpn.com');
        o.description = _('Enter a NordVPN server hostname, then use Get data to fill the IP and public key.');

        o = s.option(form.Button, '_get_server_data', _('Server Lookup'));
        o.depends('vpn_mode', 'server');
        o.inputtitle = _('Get data');
        o.inputstyle = 'apply';
        o.onclick = function () {
            return view.handleGetServerData();
        };

        o = this.server_address_option = s.option(form.Value, 'server_address', _('Server IP Address'));
        o.depends('vpn_mode', 'server');
        o.datatype = 'ipaddr';
        o.placeholder = _('185.246.211.10');
        o.validate = function (section_id, value) {
            if (view.vpn_mode_option.formvalue('config') !== 'server')
                return true;

            value = String(value || '').trim();
            if (value === '')
                return _('Please provide a server IP address.');

            return form.Value.prototype.validate.apply(this, [section_id, value]);
        };

        o = this.server_public_key_option = s.option(form.Value, 'server_public_key', _('Server Public Key'));
        o.depends('vpn_mode', 'server');
        o.placeholder = _('WireGuard public key');
        o.validate = function (_, value) {
            if (view.vpn_mode_option.formvalue('config') !== 'server')
                return true;

            return String(value || '').trim() !== '' ? true : _('Please provide a server public key.');
        };

        return m.render().then(function (nodes) {
            var servicePanel = this.renderServicePanel(serviceStatus);
            var pageActions = nodes.querySelector('.cbi-page-actions');

            if (pageActions)
                nodes.insertBefore(servicePanel, pageActions);
            else
                nodes.appendChild(servicePanel);

            return nodes;
        }.bind(this));
    },

    handleSave: async function () {
        const token = String(this.authentication_token_option.formvalue('config') || '<REPLACE_WITH_YOUR_TOKEN>').trim();
        const vpnMode = String(this.vpn_mode_option.formvalue('config') || 'recommended').trim();
        const vpnCountry = String(this.vpn_country_option.formvalue('config') || '').trim();
        const serverHostname = String(this.server_hostname_option.formvalue('config') || '').trim();
        const serverAddress = String(this.server_address_option.formvalue('config') || '').trim();
        const serverPublicKey = String(this.server_public_key_option.formvalue('config') || '').trim();

        this.config.authentication_token = token;

        if (vpnMode === 'country') {
            if (!this.vpn_country_option.isValid('config')) {
                ui.addNotification(_('Save failed'), E('p', _('Incorrect format of the country code')));
                return;
            }

            this.config.vpn = { country: vpnCountry };
        } else if (vpnMode === 'server') {
            if (serverHostname !== '' && !this.server_hostname_option.isValid('config')) {
                ui.addNotification(_('Save failed'), E('p', _('Please provide a valid server hostname.')));
                return;
            }

            if (!this.server_address_option.isValid('config')) {
                ui.addNotification(_('Save failed'), E('p', _('Please provide a valid server IP address.')));
                return;
            }

            if (!this.server_public_key_option.isValid('config')) {
                ui.addNotification(_('Save failed'), E('p', _('Please provide the server public key.')));
                return;
            }

            this.config.vpn = {
                server: {
                    address: serverAddress,
                    public_key: serverPublicKey
                }
            };

            if (serverHostname !== '')
                this.config.vpn.server.hostname = serverHostname;
        } else {
            this.config.vpn = 'recommended';
        }

        try {
            const res = await callSetConfig(this.config);
            if (!res || res.success !== true)
                ui.addNotification(_('Save failed'), E('p', _('Could not write config file.')));
            else
                ui.addNotification(_('Saved'), E('p', _('Configuration updated.')));
        } catch (err) {
            ui.addNotification(_('Save failed'), E('p', err ? String(err) : _('Unknown error')));
        }
    },

    handleSaveApply: null,
    handleReset: null
});
