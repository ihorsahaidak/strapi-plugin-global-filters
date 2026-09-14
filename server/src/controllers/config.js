'use strict';

const service = (strapi) => strapi.plugin('global-filters').service('config');

module.exports = ({ strapi }) => ({
  // GET /global-filters/config  -> { "<uid>": ["field", ...] }
  async find(ctx) {
    ctx.body = await service(strapi).getConfig();
  },

  // PUT /global-filters/config  body: { config: { "<uid>": [...] } }
  async update(ctx) {
    const body = ctx.request.body || {};
    const config = body.config !== undefined ? body.config : body;
    ctx.body = await service(strapi).setConfig(config);
  },

  // GET /global-filters/schema  -> { contentTypes: [...], config: {...} }
  async schema(ctx) {
    ctx.body = {
      contentTypes: service(strapi).getSchema(),
      config: await service(strapi).getConfig(),
    };
  },
});
