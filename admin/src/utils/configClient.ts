export type GlobalFiltersConfig = Record<string, string[]>;

type Getter = (url: string) => Promise<{ data: any }>;

// Cache on `window` (not a module variable) so the single instance is shared
// across code-split chunks — otherwise the lazy Settings chunk and the main
// list-view chunk each get their own cache, and clearing one leaves the other
// stale (filters wouldn't change until a full page reload).
const CACHE_KEY = '__globalFiltersConfigCache__';

type CacheWindow = Window & { [CACHE_KEY]?: Promise<GlobalFiltersConfig> };

const normalize = (raw: any): GlobalFiltersConfig => {
  if (!raw || typeof raw !== 'object') return {};
  const out: GlobalFiltersConfig = {};
  for (const [uid, value] of Object.entries(raw)) {
    // Tolerate the `{ fields: [...] }` object form as well as a bare array.
    const fields = Array.isArray(value)
      ? value
      : Array.isArray((value as any)?.fields)
        ? (value as any).fields
        : [];
    if (fields.length) out[uid] = fields;
  }
  return out;
};

/** Fetch the per-content-type config once and reuse it across mounts. */
export function fetchGlobalFiltersConfig(get: Getter): Promise<GlobalFiltersConfig> {
  const w = window as unknown as CacheWindow;
  if (!w[CACHE_KEY]) {
    w[CACHE_KEY] = get('/global-filters/config')
      .then((res) => normalize(res.data))
      .catch(() => ({} as GlobalFiltersConfig));
  }
  return w[CACHE_KEY] as Promise<GlobalFiltersConfig>;
}

/** Call after saving so every chunk refetches fresh config on next mount. */
export function clearGlobalFiltersConfigCache(): void {
  if (typeof window !== 'undefined') {
    delete (window as unknown as CacheWindow)[CACHE_KEY];
  }
}
