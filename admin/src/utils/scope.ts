export type FieldKind = 'relation' | 'enumeration' | 'boolean' | 'dateRange' | 'text';

export type Descriptor = {
  field: string;
  kind: FieldKind;
  target?: string; // relation target uid
  values?: string[]; // enum values
};

/* ----------------------------------------------------------- date presets */

export const DATE_PRESETS: Array<{ key: string; label: string; days: number | null }> = [
  { key: 'today', label: 'Today', days: null },
  { key: '3days', label: 'Last 3 days', days: 3 },
  { key: 'week', label: 'Last week', days: 7 },
  { key: 'month', label: 'Last month', days: 30 },
  { key: 'year', label: 'Last year', days: 365 },
];

/** Cutoff ISO for a preset, snapped to start-of-day so it is stable within a day. */
export function presetCutoffISO(key: string): string | null {
  const preset = DATE_PRESETS.find((p) => p.key === key);
  if (!preset) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (preset.days != null) d.setDate(d.getDate() - preset.days);
  return d.toISOString();
}

/** Reverse-map a stored $gte ISO back to its preset key (same-day match). */
export function isoToPreset(iso: string): string {
  return DATE_PRESETS.find((p) => presetCutoffISO(p.key) === iso)?.key ?? '';
}

/* --------------------------------------------------------------- cookie */
/**
 * Two buckets:
 *  - relations: keyed by target uid, so a "Website" pick sticks across every
 *    content type that references websites (like the language selector).
 *  - fields: keyed by content-type uid then field, for enum / boolean filters
 *    that are specific to a content type.
 */
export type CookieState = {
  relations: Record<string, string>;
  fields: Record<string, Record<string, string>>;
};

const COOKIE_NAME = 'global-filters:scope';
const ONE_YEAR = 60 * 60 * 24 * 365;

export function readCookie(): CookieState {
  const empty: CookieState = { relations: {}, fields: {} };
  if (typeof document === 'undefined') return empty;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return empty;
  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)));
    return {
      relations: parsed.relations ?? {},
      fields: parsed.fields ?? {},
    };
  } catch {
    return empty;
  }
}

export function writeCookie(state: CookieState): void {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(JSON.stringify(state));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${ONE_YEAR}`;
}

/**
 * Seed value (as a string) for a descriptor from the cookie, or ''.
 *
 * `perField` forces the per-content-type bucket for a relation that would
 * otherwise share the target-keyed one with a sibling — a content type with
 * two relations to the same target (Page's `parents` and `children`) must not
 * have a pick on one seed the other.
 */
export function cookieSeed(
  state: CookieState,
  uid: string,
  d: Descriptor,
  perField = false
): string {
  if (d.kind === 'relation' && d.target && !perField) return state.relations[d.target] ?? '';
  return state.fields[uid]?.[d.field] ?? '';
}

/** Persist one descriptor's value into the cookie state (mutates + returns). */
export function cookieStore(
  state: CookieState,
  uid: string,
  d: Descriptor,
  value: string,
  perField = false
): CookieState {
  const next: CookieState = {
    relations: { ...state.relations },
    fields: { ...state.fields },
  };
  if (d.kind === 'relation' && d.target && !perField) {
    if (value) next.relations[d.target] = value;
    else delete next.relations[d.target];
  } else {
    const bucket = { ...(next.fields[uid] ?? {}) };
    if (value) bucket[d.field] = value;
    else delete bucket[d.field];
    if (Object.keys(bucket).length) next.fields[uid] = bucket;
    else delete next.fields[uid];
  }
  return next;
}

/* ------------------------------------------------------- URL <-> filters */

type Filters = Record<string, any>;

/** Read current values (as strings) for the given descriptors from the query. */
export function readValues(query: any, descriptors: Descriptor[]): Record<string, string> {
  const filters: Filters = query?.filters ?? {};
  const and: any[] = Array.isArray(filters.$and) ? filters.$and : [];
  const values: Record<string, string> = {};

  const findClause = (field: string) =>
    and.find((c) => c && field in c)?.[field] ?? filters[field];

  for (const d of descriptors) {
    const clause = findClause(d.field);
    if (clause == null) continue;
    if (d.kind === 'relation') {
      const v = clause?.id?.$eq;
      if (v != null) values[d.field] = String(v);
    } else if (d.kind === 'dateRange') {
      const gte = clause?.$gte;
      if (gte != null) {
        const preset = isoToPreset(String(gte));
        if (preset) values[d.field] = preset;
      }
    } else if (d.kind === 'text') {
      const v = clause?.$containsi;
      if (v != null) values[d.field] = String(v);
    } else {
      const v = clause?.$eq;
      if (v != null) values[d.field] = String(v);
    }
  }
  return values;
}

/** Build a new `filters` object with the descriptor clauses replaced. */
export function writeValues(
  existing: Filters | undefined,
  descriptors: Descriptor[],
  values: Record<string, string>
): Filters {
  const src: Filters = existing && typeof existing === 'object' ? { ...existing } : {};
  const managed = new Set(descriptors.map((d) => d.field));
  const and: any[] = Array.isArray(src.$and) ? src.$and : [];

  const kept = and.filter(
    (clause) => !(clause && Object.keys(clause).some((k) => managed.has(k)))
  );
  const next = [...kept];

  for (const d of descriptors) {
    const raw = values[d.field];
    if (raw == null || raw === '') continue;
    if (d.kind === 'relation') {
      next.push({ [d.field]: { id: { $eq: Number(raw) } } });
    } else if (d.kind === 'boolean') {
      next.push({ [d.field]: { $eq: raw === 'true' } });
    } else if (d.kind === 'dateRange') {
      const iso = presetCutoffISO(raw);
      if (iso) next.push({ [d.field]: { $gte: iso } });
    } else if (d.kind === 'text') {
      next.push({ [d.field]: { $containsi: raw } });
    } else {
      next.push({ [d.field]: { $eq: raw } });
    }
  }

  // Drop any object-form leftovers for managed fields.
  for (const field of managed) delete src[field];

  if (next.length) src.$and = next;
  else delete src.$and;

  return src;
}

/* ------------------------------------------------------------ labels */

export function prettyLabel(field: string): string {
  return field
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
