'use strict';

/**
 * Read-only schema for the settings UI.
 *
 * The selection itself is not stored server-side at all — it lives in the
 * browser's localStorage, so this plugin owns no database rows and needs no
 * write endpoint. All this service does is describe which fields of which
 * content types are filterable.
 */

const FILTERABLE_TYPES = ['relation', 'enumeration', 'boolean', 'datetime'];

// Text-ish columns, filtered with a case-insensitive "contains" input.
// `blocks` and `json` are excluded: they're jsonb, where $containsi doesn't
// mean what it does on a text column.
const TEXT_TYPES = ['string', 'text', 'richtext', 'uid', 'email'];

// Noise never worth offering as a filter.
const EXCLUDED_FIELDS = new Set(['createdBy', 'updatedBy', 'localizations']);
const EXCLUDED_RELATION_TARGETS = new Set(['admin::user', 'plugin::users-permissions.user']);

module.exports = ({ strapi }) => {
  const isFilterableAttr = (name, attr) => {
    if (!attr || EXCLUDED_FIELDS.has(name)) return false;
    if (attr.type === 'relation') {
      return !!attr.target && !EXCLUDED_RELATION_TARGETS.has(attr.target);
    }
    return FILTERABLE_TYPES.includes(attr.type) || TEXT_TYPES.includes(attr.type);
  };

  const isConfigurable = (uid, ct) =>
    !!ct && uid.startsWith('api::') && ct.kind === 'collectionType';

  /**
   * Every api:: collection type with its relation / enumeration / boolean /
   * datetime / text attributes (noise excluded) plus the createdAt and
   * publishedAt date-range filters.
   */
  const getSchema = () => {
    const out = [];

    for (const [uid, ct] of Object.entries(strapi.contentTypes)) {
      if (!isConfigurable(uid, ct)) continue;

      const attributes = {};
      for (const [name, attr] of Object.entries(ct.attributes || {})) {
        if (!isFilterableAttr(name, attr)) continue;
        if (attr.type === 'relation') attributes[name] = { type: 'relation', target: attr.target };
        else if (attr.type === 'enumeration') attributes[name] = { type: 'enumeration', enum: attr.enum || [] };
        else if (attr.type === 'boolean') attributes[name] = { type: 'boolean' };
        else if (attr.type === 'datetime') attributes[name] = { type: 'datetime' };
        else attributes[name] = { type: 'text' };
      }

      attributes.createdAt = { type: 'datetime' };
      if (ct.options && ct.options.draftAndPublish) attributes.publishedAt = { type: 'datetime' };

      out.push({
        uid,
        displayName: (ct.info && ct.info.displayName) || uid,
        attributes,
      });
    }

    out.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return out;
  };

  return { getSchema };
};
