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
| text-ish        | text input, case-insensitive "contains"   | `filters[field][$containsi]=<text>`  |
| `datetime`      | date-range preset dropdown                | `filters[field][$gte]=<iso>`         |

Text-ish means `string`, `text`, `richtext`, `uid` and `email`. `password` is
never offered, and `blocks` / `json` are excluded — they're `jsonb` columns, where `$containsi` doesn't mean
what it does on a text column. Typing is debounced by 400 ms, so the list
refetches once you pause rather than once per keystroke.

`createdAt` is always offered, `publishedAt` on draft-and-publish types, and any
`datetime` attribute of your own gets the same date-range control.

Field names are auto-detected; noisy relations (`createdBy`, `updatedBy`,
`localizations`, any `admin::user` or users-permissions relation) are never
offered. Date presets: **Today / Last 3 days / Last week / Last month (30 d) /
Last year (365 d)** — cutoffs snap to start-of-day so they're stable within a day.

Selections persist in the `global-filters:scope` cookie: relation picks stick
across content types (keyed by target uid, so a "Website" pick follows you
everywhere websites are referenced), enum / boolean / date / text picks per
content type. When one content type has **two relations to the same target**
(a self-referencing `parents` / `children` pair, say) they'd collide in that
shared bucket, so both fall back to per-content-type storage instead.

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

Registered via `createSettingSection` as **Settings → Global Filters**.

A master switch sits at the top, **off by default** — while it's off no filter
bar is rendered anywhere, and field selections are kept for when it's switched
back on. Turning it on reveals every `api::` collection type as an accordion,
one open at a time, each holding that type's filterable fields grouped
**Relations / Choices / Dates / Text**, with a **Clear** button on any type that
has a selection.

### Where settings are stored

In the browser's **`localStorage`**, under the key `global-filters:config` — this
plugin owns no database rows and has no write endpoint:

```jsonc
{
  "enabled": true,
  "fields": {
    "api::page.page": ["websites", "countries", "page_type", "title", "createdAt"]
  }
}
```

Only this admin bundle ever reads the selection, so a server round-trip bought
nothing, and a cookie would have ridden along on every request to Strapi for no
reason. The trade-off is deliberate: **settings are per-browser, not shared by
the team.** They survive reloads, restarts and redeploys, and are lost by
clearing site data, by a different browser, profile or machine, or in a private
window. Content types with no selected fields are pruned rather than stored
empty, and a corrupt or partly-junk stored value degrades to "nothing
configured" instead of throwing. Saving in one tab reaches other open tabs
through the `storage` event.

The server keeps exactly one route, to describe the schema — it never sees the
selection.

---

## HTTP API

All routes are **admin-type** (authenticated admin), mounted under `/global-filters`.

| Method | Path       | Body / input | Purpose                             |
| ------ | ---------- | ------------ | ----------------------------------- |
| GET    | `/schema`  | —            | Filterable fields per content type  |

---

## Known limitations

- **Off by default** — the master switch starts off, and nothing appears until
  it's on and fields are picked in Settings → Global Filters.
- **Settings are per-browser.** There is no shared team default; each person
  configures their own, and clearing site data resets them.
- **Relation options are capped at 100 rows** per target and sorted client-side
  by label. A target with more entries shows the first page only, and stale-id
  pruning is skipped for it (a valid id is never dropped, but a dead one isn't
  cleaned up either). The sort is deliberately not delegated to the API: a
  `sort=name:ASC` throws `Attribute name not found on model <uid>` for any
  target without a `name` field — a self-referencing `parents` / `children`
  relation, say.
- **Relation option labels** come from the first non-empty of `name`, `title`
  or `slug`, falling back to `#<id>`.
- If a target's options can't be loaded, that filter renders empty and no
  stored id is judged stale — the rest of the bar keeps working.
- The filter row is **portalled** next to the Content Manager's own action bar,
  because `listView.actions` is the only injection zone available. A future
  Strapi restructure of that DOM could move the row back inside the toolbar.
- **Single types** are ignored.

---

## License

MIT © Ihor Sahaidak
