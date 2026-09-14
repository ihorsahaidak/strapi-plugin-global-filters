'use strict';

const service = (strapi) => strapi.plugin('global-filters').service('config');

module.exports = ({ strapi }) => ({
  // GET /global-filters/schema  -> { contentTypes: [...] }
  // The selection itself lives in the browser's localStorage, so there is
  // nothing to read or write here.
  async schema(ctx) {
    ctx.body = { contentTypes: service(strapi).getSchema() };
  },
});
