'use strict';

const fs = require('fs-extra');
const path = require('path');
const template = require('lodash/template');

const getUid = require('./get-uid');
const {Extension, errors} = require('../../lib');

const {ProcessError, SystemError} = errors;

class SystemdExtension extends Extension {
    setup(cmd, argv) {
        const instance = this.system.getInstance();

        if (!argv.local && instance.config.get('process') === 'systemd') {
            cmd.addStage('systemd', this._setup.bind(this), [], 'Systemd');
        }
    }

    _setup(argv, {instance}, task) {
        const uid = getUid(instance.dir);

        // getUid returns either the uid or null
        if (!uid) {
            this.ui.log('The "ghost" user has not been created, please run `ghost setup linux-user` first', 'yellow');
            return task.skip();
        }

        const serviceFilename = `ghost_${instance.name}.service`;

        if (instance.cliConfig.get('extension.systemd', false) || fs.existsSync(path.join('/lib/systemd/system', serviceFilename))) {
            this.ui.log('Systemd service has already been set up. Skipping Systemd setup');
            return task.skip();
        }

        const service = template(fs.readFileSync(path.join(__dirname, 'ghost.service.template'), 'utf8'));
        const contents = service({
            name: instance.name,
            dir: process.cwd(),
            user: uid,
            environment: this.system.environment,
            ghost_exec_path: process.argv.slice(0,2).join(' ')
        });

        return this.template(instance, contents, 'systemd service', serviceFilename, '/lib/systemd/system').then(
            () => this.ui.sudo('systemctl daemon-reload')
        ).catch((error) => {
            throw new ProcessError(error);
        });
    }

    uninstall(instance) {
        const serviceFilename = `/lib/systemd/system/ghost_${instance.name}.service`;

        if (fs.existsSync(serviceFilename)) {
            return this.ui.sudo(`rm ${serviceFilename}`).catch(() => {
                throw new SystemError('Systemd service file link could not be removed, you will need to do this manually.');
            });
        }

        return Promise.resolve();
    }
}

module.exports = SystemdExtension;
