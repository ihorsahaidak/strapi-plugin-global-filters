import * as React from 'react';
import {
  Flex,
  Typography,
  Combobox,
  ComboboxOption,
  SingleSelect,
  SingleSelectOption,
  Field,
  IconButton,
} from '@strapi/design-system';
import { Cross } from '@strapi/icons';
import {
  useFetchClient,
  useQueryParams,
  unstable_useContentManagerContext as useContentManagerContext,
} from '@strapi/strapi/admin';

import { readConfig, fieldsFor } from '../utils/configClient';
import {
  Descriptor,
  readValues,
  writeValues,
  readCookie,
  writeCookie,
  cookieSeed,
  cookieStore,
  prettyLabel,
  DATE_PRESETS,
} from '../utils/scope';

type Option = { value: string; label: string };

const TEXT_TYPES = ['string', 'text', 'richtext', 'uid', 'email'];
const EMPTY_ATTRIBUTES: Record<string, any> = {};

/**
 * Loaded options for one relation target. `complete` means the response wasn't
 * truncated by the page size, so "not in this list" reliably means "gone" —
 * without it we must not treat an unknown id as stale.
 */
type OptionSet = { options: Option[]; complete: boolean };

const firstNonEmpty = (...values: any[]): string => {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
};

/**
 * Sorted here rather than by the API: a `sort=name:ASC` throws
 * "Attribute name not found on model <uid>" on any target without a `name`
 * field (a self-referencing page relation, say), and the failed request would
 * take the whole bar's readiness down with it.
 */
const relationOptions = (results: any[]): Option[] =>
  (results ?? [])
    .map((r) => ({
      value: String(r.id),
      label: firstNonEmpty(r.name, r.title, r.slug) || `#${r.id}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const RELATION_PAGE_SIZE = 100;
const TEXT_DEBOUNCE_MS = 400;

/**
 * A text filter types one character at a time, but each committed value pushes
 * a history entry and refetches the list — so hold the keystrokes locally and
 * only commit once typing pauses. The local value resets whenever the
 * committed one changes underneath it (seeding, back button, another control).
 */
const TextFilter = ({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = React.useState(value);
  const committedRef = React.useRef(value);
  const commitRef = React.useRef(onCommit);
  commitRef.current = onCommit;

  React.useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value;
      setDraft(value);
    }
  }, [value]);

  React.useEffect(() => {
    if (draft === committedRef.current) return;
    const timer = setTimeout(() => {
      committedRef.current = draft;
      commitRef.current(draft);
    }, TEXT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const clear = () => {
    committedRef.current = '';
    setDraft('');
    commitRef.current('');
  };

  return (
    <Field.Root name={`global-filters-${label}`}>
      <Field.Input
        size="S"
        aria-label={`Filter by ${label}`}
        placeholder={`${label} contains…`}
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        endAction={
          draft ? (
            <IconButton
              label={`Clear ${label}`}
              variant="ghost"
              size="XS"
              type="button"
              onClick={clear}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            >
              <Cross />
            </IconButton>
          ) : undefined
        }
      />
    </Field.Root>
  );
};

/**
 * Config-driven sticky filter bar injected into the Content Manager list view.
 * The set of fields is configured per content type in
 * Settings → Global Filters. Selections are reflected in the list
 * `filters` query param and remembered in a cookie.
 */
const FilterBar = () => {
  const ctx = useContentManagerContext() as any;
  const { get } = useFetchClient();
  const [{ query }, setQuery] = useQueryParams<any>();

  const model: string | undefined = ctx?.model;
  const collectionType: string | undefined = ctx?.collectionType;
  const attributes: Record<string, any> = ctx?.contentType?.attributes ?? EMPTY_ATTRIBUTES;

  const [fields, setFields] = React.useState<string[] | null>(null);
  const [relOptions, setRelOptions] = React.useState<Record<string, OptionSet>>({});

  // Configured fields come straight out of localStorage — no request, so they
  // are available on the first render rather than a tick later.
  React.useEffect(() => {
    if (!model || collectionType !== 'collection-types') {
      setFields([]);
      return;
    }
    const apply = () => setFields(fieldsFor(readConfig(), model));
    apply();
    // Settings saved in another tab should reach this one too.
    window.addEventListener('storage', apply);
    return () => window.removeEventListener('storage', apply);
  }, [model, collectionType]);

  const descriptors: Descriptor[] = React.useMemo(() => {
    if (collectionType !== 'collection-types') return [];
    return (fields ?? [])
      .map((field) => {
        // Timestamp fields aren't always present in the schema attributes.
        const isTimestamp = ['createdAt', 'updatedAt', 'publishedAt'].includes(field);
        const attr = attributes[field];
        if (attr?.type === 'datetime' || isTimestamp) {
          return { field, kind: 'dateRange' } as Descriptor;
        }
        if (!attr) return null;
        if (attr.type === 'relation' && attr.target) {
          return { field, kind: 'relation', target: attr.target } as Descriptor;
        }
        if (attr.type === 'enumeration') {
          return { field, kind: 'enumeration', values: attr.enum ?? [] } as Descriptor;
        }
        if (attr.type === 'boolean') {
          return { field, kind: 'boolean' } as Descriptor;
        }
        if (TEXT_TYPES.includes(attr.type)) {
          return { field, kind: 'text' } as Descriptor;
        }
        return null;
      })
      .filter(Boolean) as Descriptor[];
  }, [fields, attributes, collectionType]);

  // Fetch options for each distinct relation target.
  React.useEffect(() => {
    const targets = Array.from(
      new Set(descriptors.filter((d) => d.kind === 'relation').map((d) => d.target!))
    );
    let cancelled = false;
    targets.forEach((target) => {
      if (relOptions[target]) return;
      get(`/content-manager/collection-types/${target}?pageSize=${RELATION_PAGE_SIZE}`)
        .then((res) => {
          if (cancelled) return;
          const data = res.data as any;
          const results = Array.isArray(data?.results) ? data.results : [];
          const options = relationOptions(results);
          const total = data?.pagination?.total;
          setRelOptions((prev) => ({
            ...prev,
            [target]: {
              options,
              // Off the raw row count, not the mapped options — an unlabelled
              // row still proves the page was full.
              complete:
                typeof total === 'number'
                  ? total <= results.length
                  : results.length < RELATION_PAGE_SIZE,
            },
          }));
        })
        .catch(() => {
          if (cancelled) return;
          // Record the failure instead of leaving the target unresolved:
          // `relationsReady` waits on every target, so one dead request would
          // otherwise stop the cookie from seeding anything at all. `complete:
          // false` keeps it from judging any stored id stale.
          setRelOptions((prev) => ({ ...prev, [target]: { options: [], complete: false } }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [descriptors, get, relOptions]);

  const values = React.useMemo(
    () => readValues(query, descriptors),
    [query, descriptors]
  );

  const applyValues = React.useCallback(
    (next: Record<string, string>, replaceHistory = false) => {
      const filters = writeValues(query?.filters, descriptors, next);
      setQuery({ filters, page: 1 }, 'push', replaceHistory);
    },
    [query, descriptors, setQuery]
  );

  const relationDescriptors = React.useMemo(
    () => descriptors.filter((d) => d.kind === 'relation'),
    [descriptors]
  );

  const duplicateTargets = React.useMemo(() => {
    const seen = new Map<string, number>();
    for (const d of relationDescriptors) seen.set(d.target!, (seen.get(d.target!) ?? 0) + 1);
    return new Set([...seen].filter(([, count]) => count > 1).map(([target]) => target));
  }, [relationDescriptors]);

  const isPerField = React.useCallback(
    (d: Descriptor) => d.kind === 'relation' && duplicateTargets.has(d.target!),
    [duplicateTargets]
  );

  const onChange = React.useCallback(
    (d: Descriptor, value: string) => {
      const next = { ...values, [d.field]: value };
      if (!value) delete next[d.field];
      applyValues(next);
      writeCookie(cookieStore(readCookie(), model!, d, value, isPerField(d)));
    },
    [values, applyValues, model, isPerField]
  );

  // Don't act on relation values before we know what ids actually exist.
  const relationsReady = React.useMemo(
    () => relationDescriptors.every((d) => relOptions[d.target!] !== undefined),
    [relationDescriptors, relOptions]
  );

  /**
   * A stored id is only meaningful while the record still exists. Numeric ids
   * are not stable across a restore / re-import — those delete and re-insert
   * every row, so the database hands out fresh ids. A cookie (or a refreshed,
   * bookmarked URL) holding a pre-restore id would otherwise re-apply a filter
   * that matches nothing: the list renders empty while this bar shows a blank
   * select, because the value resolves to no option.
   *
   * Only judge an id stale when the option list is COMPLETE, otherwise a target
   * with more records than one page would have valid ids pruned.
   */
  const isStaleRelationValue = React.useCallback(
    (d: Descriptor, value: string) => {
      if (!value) return false;
      const set = relOptions[d.target!];
      if (!set || !set.complete) return false;
      return !set.options.some((o) => o.value === value);
    },
    [relOptions]
  );

  // Seed from the cookie once per (model, config) when the URL has no value,
  // and drop any stale value already sitting in the URL or the cookie.
  const seededRef = React.useRef('');
  React.useEffect(() => {
    if (!model || descriptors.length === 0 || !relationsReady) return;
    const sig = `${model}:${descriptors.map((d) => d.field).join(',')}`;
    if (seededRef.current === sig) return;
    seededRef.current = sig;

    let cookie = readCookie();
    let cookieChanged = false;
    const seeded = { ...values };
    let changed = false;

    for (const d of descriptors) {
      // Already in the URL (refresh, bookmark, shared link) — keep it unless
      // it points at something that no longer exists.
      if (seeded[d.field]) {
        if (isStaleRelationValue(d, seeded[d.field])) {
          delete seeded[d.field];
          changed = true;
          cookie = cookieStore(cookie, model, d, '', isPerField(d));
          cookieChanged = true;
        }
        continue;
      }
      const seed = cookieSeed(cookie, model, d, isPerField(d));
      if (!seed) continue;
      if (isStaleRelationValue(d, seed)) {
        // Forget it rather than re-applying a filter that can't match.
        cookie = cookieStore(cookie, model, d, '', isPerField(d));
        cookieChanged = true;
        continue;
      }
      seeded[d.field] = seed;
      changed = true;
    }

    if (cookieChanged) writeCookie(cookie);
    if (changed) applyValues(seeded, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, descriptors, relationsReady]);

  if (collectionType !== 'collection-types' || descriptors.length === 0) return null;

  return (
    <Flex gap={2} alignItems="flex-end" wrap="wrap" paddingTop={2} paddingBottom={4}>
      {descriptors.map((d) => (
        <Flex key={d.field} direction="column" alignItems="stretch" gap={1} width="16rem">
          <Typography variant="pi" fontWeight="bold" textColor="neutral600">
            {prettyLabel(d.field)}
          </Typography>
          {d.kind === 'relation' ? (
            <Combobox
              size="S"
              placeholder={`All ${prettyLabel(d.field).toLowerCase()}`}
              aria-label={`Filter by ${prettyLabel(d.field)}`}
              value={values[d.field] ?? ''}
              onChange={(v?: string) => onChange(d, v ?? '')}
              onClear={() => onChange(d, '')}
            >
              {(relOptions[d.target!]?.options ?? []).map((o) => (
                <ComboboxOption key={o.value} value={o.value}>
                  {o.label}
                </ComboboxOption>
              ))}
            </Combobox>
          ) : d.kind === 'text' ? (
            <TextFilter
              label={prettyLabel(d.field)}
              value={values[d.field] ?? ''}
              onCommit={(next) => onChange(d, next)}
            />
          ) : (
            <SingleSelect
              size="S"
              placeholder={
                d.kind === 'dateRange'
                  ? `${prettyLabel(d.field).replace(/ At$/, '')}: any time`
                  : `All ${prettyLabel(d.field).toLowerCase()}`
              }
              aria-label={`Filter by ${prettyLabel(d.field)}`}
              value={values[d.field] ?? ''}
              onChange={(v: string | number) => onChange(d, v === undefined ? '' : String(v))}
              onClear={() => onChange(d, '')}
            >
              {d.kind === 'dateRange'
                ? DATE_PRESETS.map((p) => (
                    <SingleSelectOption key={p.key} value={p.key}>
                      {p.label}
                    </SingleSelectOption>
                  ))
                : d.kind === 'boolean'
                  ? [
                      <SingleSelectOption key="true" value="true">
                        Yes
                      </SingleSelectOption>,
                      <SingleSelectOption key="false" value="false">
                        No
                      </SingleSelectOption>,
                    ]
                  : (d.values ?? []).map((v) => (
                      <SingleSelectOption key={v} value={v}>
                        {v}
                      </SingleSelectOption>
                    ))}
            </SingleSelect>
          )}
        </Flex>
      ))}
    </Flex>
  );
};

export default FilterBar;
