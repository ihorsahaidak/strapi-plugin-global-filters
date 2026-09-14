'use strict';

/**
 * Per-content-type filter configuration.
 *
 * Stored shape: { "<uid>": ["field", ...] }
 * Persisted in the plugin store, so the config is shared across all admins.
 */

const STORE_KEY = 'filterConfig';
const FILTERABLE_TYPES = ['relation', 'enumeration', 'boolean', 'datetime'];

// Text-ish columns, filtered with a case-insensitive "contains" input.
// `blocks` and `json` are excluded: they're jsonb, where $containsi doesn't
// mean what it does on a text column.
const TEXT_TYPES = ['string', 'text', 'richtext', 'uid', 'email'];

// Noise never worth offering as a filter.
const EXCLUDED_FIELDS = new Set(['createdBy', 'updatedBy', 'localizations']);
const EXCLUDED_RELATION_TARGETS = new Set(['admin::user', 'plugin::users-permissions.user']);

module.exports = ({ strapi }) => {
  const store = () => strapi.store({ type: 'plugin', name: 'global-filters' });

  const isFilterableAttr = (name, attr) => {
    if (!attr || EXCLUDED_FIELDS.has(name)) return false;
    if (attr.type === 'relation') {
      return !!attr.target && !EXCLUDED_RELATION_TARGETS.has(attr.target);
    }
    return FILTERABLE_TYPES.includes(attr.type) || TEXT_TYPES.includes(attr.type);
  };

  // Accepts both the bare array form and `{ fields: [...] }`, so a config
  // written by an older/newer shape still reads.
  const normalizeEntry = (raw) => {
    if (Array.isArray(raw)) return [...new Set(raw)];
    if (raw && typeof raw === 'object' && Array.isArray(raw.fields)) return [...new Set(raw.fields)];
    return [];
  };

  const getConfig = async () => {
    const stored = (await store().get({ key: STORE_KEY })) || {};
    const out = {};
    for (const [uid, raw] of Object.entries(stored)) {
      const fields = normalizeEntry(raw);
      if (fields.length) out[uid] = fields;
    }
    return out;
  };

  const validFieldsFor = (uid, fields) => {
    const ct = strapi.contentTypes[uid];
    if (!ct) return [];
    return (Array.isArray(fields) ? fields : []).filter((field) => {
      if (field === 'createdAt') return true;
      if (field === 'publishedAt' && ct.options && ct.options.draftAndPublish) return true;
      return isFilterableAttr(field, ct.attributes && ct.attributes[field]);
    });
  };

  const setConfig = async (config) => {
    const clean = {};
    if (config && typeof config === 'object') {
      for (const [uid, raw] of Object.entries(config)) {
        if (!strapi.contentTypes[uid]) continue;
        const fields = [...new Set(validFieldsFor(uid, normalizeEntry(raw)))];
        if (fields.length) clean[uid] = fields;
      }
    }
    await store().set({ key: STORE_KEY, value: clean });
    return clean;
  };

  /**
   * Schema shown in the settings UI: every api:: collection type with its
   * relation / enumeration / boolean / datetime / text attributes (noise
   * excluded) plus the createdAt / publishedAt date-range filters.
   */
  const getSchema = () => {
    const out = [];

    for (const [uid, ct] of Object.entries(strapi.contentTypes)) {
      if (!uid.startsWith('api::') || ct.kind !== 'collectionType') continue;

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

  return { getConfig, setConfig, getSchema };
};
