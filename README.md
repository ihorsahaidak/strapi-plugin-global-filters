# Global Filters

A Strapi 5 plugin that adds **always-on, sticky list filters** to the Content
Manager. You pick which fields become quick filters per content type; the
controls render on their own row above the list toolbar, and selections stay
applied across reloads and navigation — like the language selector.

Published as [`strapi-plugin-global-filters`](https://www.npmjs.com/package/strapi-plugin-global-filters).

---

## Table of contents

- [Installation & enabling](#installation--enabling)
- [How it works](#how-it-works)
- [Stale relation ids self-heal](#stale-relation-ids-self-heal)
- [Settings page](#settings-page)
- [HTTP API](#http-api)
- [Known limitations](#known-limitations)

---

## Installation & enabling

```bash
npm install strapi-plugin-global-filters
# or
yarn add strapi-plugin-global-filters
```

The plugin is auto-discovered. If you keep an explicit plugins config, enable it
in `config/plugins.ts` (or `.js`):

```ts
export default () => ({
  'global-filters': { enabled: true },
});
```

Then rebuild the admin panel and start Strapi:

```bash
npm run build && npm run develop
```

Requires **Strapi 5**. Nothing is enabled by default — filters are opt-in per
content type from **Settings → Global Filters**.

---

## How it works

A filter row is added **above** the Content-Manager list toolbar. Each
configured field renders a control:

| Field kind      | Control                                   | Query applied                        |
| --------------- | ----------------------------------------- | ------------------------------------ |
| `relation`      | searchable dropdown of related entries    | `filters[field][id][$eq]=<id>`       |
| `enumeration`   | value dropdown                            | `filters[field][$eq]=<value>`        |
| `boolean`       | Yes / No dropdown                         | `filters[field][$eq]=<true\|false>`  |
| `createdAt`     | date-range preset dropdown                | `filters[createdAt][$gte]=<iso>`     |
| `publishedAt`   | date-range preset dropdown (D&P only)     | `filters[publishedAt][$gte]=<iso>`   |

Field names are auto-detected; noisy relations (`createdBy`, `updatedBy`,
`localizations`, any `admin::user` or users-permissions relation) are never
offered. Date presets: **Today / Last 3 days / Last week / Last month (30 d) /
Last year (365 d)** — cutoffs snap to start-of-day so they're stable within a day.

Selections persist in the `global-filters:scope` cookie: relation picks stick
across content types (keyed by target uid, so a "Website" pick follows you
everywhere websites are referenced), enum / boolean / date picks per content type.

Only **collection types** are handled; single types have no list view.

### Stale relation ids self-heal

A relation filter stores a numeric id, and ids are not stable across a restore
or re-import. Before re-applying a stored id the bar waits for the target's
options to load and drops the value if that record no longer exists — otherwise
a stale id would silently filter the list down to zero rows while the control
itself rendered blank. An id is only judged stale when the option list is known
to be **complete** (the response wasn't truncated by the 100-row page size), so
targets with more records than one page never lose valid selections.

---

## Settings page

Registered via `createSettingSection` as **Settings → Global Filters → Filters**:
every `api::` collection type with its filterable fields grouped
**Relations / Choices / Dates**. Saving shows a **"Reload to apply"** prompt —
the config is fetched once per page load and cached across admin chunks.

Config is stored in the plugin store under the key `filterConfig`:

```jsonc
{
  "api::page.page": ["websites", "countries", "page_type", "createdAt"]
}
```

Content types with no selected fields are dropped rather than stored empty, and
the server re-validates every field name on save — an unknown field, or one
whose attribute isn't filterable, is discarded regardless of what the request
sends.

---

## HTTP API

All routes are **admin-type** (authenticated admin), mounted under `/global-filters`.

| Method | Path       | Body / input                             | Purpose                                          |
| ------ | ---------- | ---------------------------------------- | ------------------------------------------------ |
| GET    | `/config`  | —                                        | Per-content-type field list                      |
| PUT    | `/config`  | `{ config: { "<uid>": ["field", …] } }`  | Save config (validated, returns the stored form) |
| GET    | `/schema`  | —                                        | Filterable fields per content type + config      |

---

## Known limitations

- **Off by default** for every content type — nothing appears until fields are
  picked in Settings → Global Filters.
- **Relation options are capped at 100 rows** per target, sorted by `name`. A
  target with more entries shows the first page only, and stale-id pruning is
  skipped for it (a valid id is never dropped, but a dead one isn't cleaned up
  either).
- **Relation option labels** come from `name`, `title` or `slug`, in that order,
  falling back to `#<id>`.
- The filter row is **portalled** next to the Content Manager's own action bar,
  because `listView.actions` is the only injection zone available. A future
  Strapi restructure of that DOM could move the row back inside the toolbar.
- **Single types** are ignored.

---

## License

MIT © Ihor Sahaidak
