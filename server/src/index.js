'use strict';

const routes = require('./routes');
const controllers = require('./controllers');
const services = require('./services');

/**
 * global-filters plugin (server).
 *
 * Exposes admin-only endpoints for the per-content-type filter configuration.
 * No content types are assumed — filter fields are opt-in per content type
 * from Settings → Global Filters (empty until configured).
 */
module.exports = {
  register() {},
  bootstrap() {},
  destroy() {},
  routes,
  controllers,
  services,
};
