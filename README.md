# Global Filters

Always-on, sticky filters for the Strapi 5 Content Manager. Pick the fields you
actually filter by — they sit above every list, and they're still applied when
you come back to it.

[![npm](https://img.shields.io/npm/v/strapi-plugin-global-filters)](https://www.npmjs.com/package/strapi-plugin-global-filters)
[![license](https://img.shields.io/npm/l/strapi-plugin-global-filters)](./LICENSE)

- **No database footprint** — no tables, no migrations, not a single read or write.
- **No runtime dependencies** — nothing in your `node_modules` beyond Strapi's own packages.
- **Settings per browser** — stored in `localStorage`, so every editor gets their own setup.
- **Nothing leaves the browser** — it only records which fields you filter by and what you picked.

---

## Install

```bash
npm install strapi-plugin-global-filters
```

Requires **Strapi 5**. The plugin is auto-discovered; if you keep an explicit
plugins config, add it to `config/plugins.ts`:

```ts
export default () => ({
  'global-filters': { enabled: true },
});
```

Then `npm run build && npm run develop`.

## Use it

Go to **Settings → Global Filters** and turn the master switch on — it starts
**off**, and nothing renders anywhere until you flip it.

Each collection type is an accordion holding its filterable fields, grouped
**Relations / Choices / Dates / Text**. Tick the ones you want, hit **Save**,
and they appear as a row above that type's list in the Content Manager.

Turning the master switch back off hides every filter bar but keeps your
selections for next time.

## What you can filter on

| Field type                                  | Control                       | Query applied                       |
| ------------------------------------------- | ----------------------------- | ----------------------------------- |
| `relation`                                  | searchable dropdown           | `filters[f][id][$eq]=<id>`          |
| `enumeration`                               | value dropdown                | `filters[f][$eq]=<value>`           |
| `boolean`                                   | Yes / No dropdown             | `filters[f][$eq]=<true\|false>`     |
| `string` `text` `richtext` `uid` `email`    | text input, "contains"        | `filters[f][$containsi]=<text>`     |
| `datetime` (incl. `createdAt`/`publishedAt`)| date-range preset dropdown    | `filters[f][$gte]=<iso>`            |

Date presets: **Today / Last 3 days / Last week / Last month / Last year**,
snapped to start-of-day.

Not offered, by design: `blocks` and `json` (jsonb columns, where `$containsi`
doesn't behave), `password`, `media`, `dynamiczone`, and noisy relations
(`createdBy`, `updatedBy`, `localizations`, anything pointing at a user).
Single types are ignored — they have no list view.

## Where settings are stored

In `localStorage`, under `global-filters:config`:

```jsonc
{
  "enabled": true,
  "fields": { "api::page.page": ["websites", "page_type", "title", "createdAt"] }
}
```

Only the admin bundle ever reads this, so a server round-trip would buy nothing
and a cookie would ride along on every request to Strapi for no reason.

The trade-off is deliberate: **settings are per-browser, not shared by the
team.** They survive reloads, restarts and redeploys; they're lost by clearing
site data, or in another browser, profile or private window. Saving in one tab
reaches your other open tabs. A corrupt stored value degrades to "nothing
configured" rather than throwing.

Your *selections* (which website, which date range, what you typed) are
remembered separately in the `global-filters:scope` cookie. Relation picks
follow you across content types — choose a Website once and it stays chosen
wherever websites are referenced — while every other kind is per content type.

## HTTP API

One route, admin-authenticated, mounted under `/global-filters`. It describes
the schema; it never sees your selection.

| Method | Path      | Purpose                            |
| ------ | --------- | ---------------------------------- |
| GET    | `/schema` | Filterable fields per content type |

## Good to know

- **Stale relation ids self-heal.** Relation filters store numeric ids, which
  are not stable across a database restore. Before re-applying a stored id the
  bar waits for the target's options and drops the value if that record is
  gone — otherwise a dead id would silently filter the list to zero rows while
  the control itself looked empty.
- **Relation options are capped at 100 rows** per target, sorted client-side by
  label (`name`, `title` or `slug`, falling back to `#<id>`). Beyond that only
  the first page shows, and stale-id pruning is skipped — a valid id is never
  dropped, but a dead one isn't cleaned up either.
- **Typing is debounced** by 400 ms, so a text filter refetches the list once
  you pause rather than once per keystroke.
- The filter row is **portalled** next to the Content Manager's action bar,
  because `listView.actions` is the only injection zone Strapi exposes.

## License

MIT © Ihor Sahaidak
