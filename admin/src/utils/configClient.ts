export type GlobalFiltersConfig = {
  /** Master switch — off until someone turns it on. */
  enabled: boolean;
  /** Selected filter fields per content-type uid. */
  fields: Record<string, string[]>;
};

const STORAGE_KEY = 'global-filters:config';

export const EMPTY_CONFIG: GlobalFiltersConfig = { enabled: false, fields: {} };

const normalize = (raw: any): GlobalFiltersConfig => {
  if (!raw || typeof raw !== 'object') return EMPTY_CONFIG;
  const fields: Record<string, string[]> = {};
  const source = raw.fields && typeof raw.fields === 'object' ? raw.fields : {};
  for (const [uid, value] of Object.entries(source)) {
    const list = Array.isArray(value) ? value.filter((f) => typeof f === 'string') : [];
    if (list.length) fields[uid] = [...new Set(list)];
  }
  return { enabled: !!raw.enabled, fields };
};

/**
 * Settings live in localStorage, not the database: they're read only by this
 * admin bundle, so a server round-trip bought nothing, and a cookie would ride
 * along on every request to Strapi for no reason. The trade-off is that they're
 * per-browser rather than shared by the team.
 *
 * Every access is guarded — localStorage throws outright in some privacy modes
 * rather than returning null.
 */
export function readConfig(): GlobalFiltersConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : EMPTY_CONFIG;
  } catch {
    return EMPTY_CONFIG;
  }
}

export function writeConfig(config: GlobalFiltersConfig): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(config)));
    return true;
  } catch {
    return false;
  }
}

/** Fields to render for one content type — none at all while the switch is off. */
export function fieldsFor(config: GlobalFiltersConfig, uid: string | undefined): string[] {
  if (!config.enabled || !uid) return [];
  return config.fields[uid] ?? [];
}
