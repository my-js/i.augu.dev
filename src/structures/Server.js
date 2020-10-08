const { existsSync, promises: fs } = require('fs');
const { Collection } = require('@augu/immutable');
const { Signale } = require('signale');
const fileUpload = require('express-fileupload');
const express = require('express');
const routes = require('../routes');
const utils = require('../util');
const GC = require('../util/GarbageCollector');

module.exports = class Server {
  /**
   * Creates a new `Server` instance
   * @param {Config} config The config
   */
  constructor(config) {
    this.bootedAt = Date.now();
    this.requests = 0;
    this.routers = new Collection();
    this.logger = new Signale({ scope: 'Server' });
    this.config = config;
    this.app = express();
    
    if (config.features.gc) this.gc = new GC(this);
  }

  isDev() {
    return this.config.environment === 'development';
  }

  isJest() {
    return this.config.environment === 'jest';
  }

  addMiddleware() {
    this.app.use(fileUpload({
      preserveExtension: true,
      safeFileNames: true
    }));

    // Prevents XSS attacks
    this.app.use((_, res, next) => {
      res.setHeader('X-Powered-By', 'auguwu tehc (https://github.com/auguwu/i.augu.dev)');
      next();
    });
  }

  addRoutes() {
    for (const [, router] of Object.entries(routes)) {
      this.routers.set(router.route, router);
      for (const route of router.routes.values()) {
        this.logger.info(`Registered "${route.route}" to the main app instance`);
        this.app[route.method](route.route, async (req, res) => {
          try {
            this.requests++;
            await route.callee.apply(this, [req, res]);
          } catch(ex) {
            this.logger.error(`Unable to fulfill request to "${route.route}"`, ex);
            return res.status(500).json({
              statusCode: 500,
              message: 'Unable to fulfill request',
              error: ex.message
            });
          }
        });
      }
    }
  }

  async launch() {
    this.logger.info('Launching ShareX server...');
    
    if (!existsSync(utils.getArbitrayPath('uploads'))) {
      this.logger.warn('Missing "uploads/" directory, now creating...');
      await fs.mkdir(utils.getArbitrayPath('uploads'));

      this.logger.info('Created "uploads/" directory for you! Now building middleware and routes...');
    }

    this.addMiddleware();
    this.addRoutes();

    if (this.config.hasOwnProperty('features') && this.config.features.hasOwnProperty('gc')) {
      this.logger.info('Built all middleware! Now starting garbage collector...');
      await this.gc.start(604800000);
      this.logger.info('Started the garbage collector! Now waiting 2 seconds to run the server...');
    } else {
      this.logger.info('Built all middleware! Now waiting 2 seconds to run the server...');
    }

    await utils.sleep(2000);
    this._server = this.app.listen(this.config.port, () =>
      this.logger.info(`Now listening on port ${this.config.port}${this.isDev() ? ', running locally!' : ' (https://i.augu.dev)'}`)
    );
  }

  /**
   * Disposes any connections
   */
  dispose() {
    this.logger.warn('Disposing all instances...');

    if (this.config.features.gc) this.gc.dispose();

    this._server.close();
    this.routers.clear();

    this.logger.warn('Disposed the ShareX server');
  }
};

/**
 * @typedef {object} Config
 * @prop {"development" | "production" | "jest"} environment The environment state of the server
 * @prop {FeatureConfig} features The features to enable/disable
 * @prop {number} port The port to use to connect
 * @prop {string} key The master key to add images
 * 
 * @typedef {object} FeatureConfig
 * @prop {number} [gc] Disable/Enable the garbage collector
 */
