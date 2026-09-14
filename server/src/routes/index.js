'use strict';

/**
 * Admin-type routes are mounted under `/global-filters` and require an
 * authenticated admin user (same session the Content Manager uses).
 */
module.exports = {
  admin: {
    type: 'admin',
    routes: [
      {
        method: 'GET',
        path: '/schema',
        handler: 'config.schema',
        config: { policies: [] },
      },
    ],
  },
};
