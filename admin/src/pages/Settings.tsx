import * as React from 'react';
import { Box, Flex, Typography, Button, Checkbox, Divider, Modal } from '@strapi/design-system';
import { Check, ArrowClockwise } from '@strapi/icons';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';

import { prettyLabel } from '../utils/scope';
import { clearGlobalFiltersConfigCache, GlobalFiltersConfig } from '../utils/configClient';

type AttrMeta = {
  type: 'relation' | 'enumeration' | 'boolean' | 'datetime';
  target?: string;
  enum?: string[];
};
type ContentTypeMeta = {
  uid: string;
  displayName: string;
  attributes: Record<string, AttrMeta>;
};

const shortTarget = (uid?: string) => (uid ? uid.split('.').pop() : '');

const attrHint = (attr: AttrMeta) => {
  if (attr.type === 'relation') return shortTarget(attr.target);
  if (attr.type === 'enumeration') return `${(attr.enum ?? []).length} values`;
  if (attr.type === 'datetime') return 'date range';
  return 'yes / no';
};

const GROUPS: Array<{ key: string; label: string; match: (a: AttrMeta) => boolean }> = [
  { key: 'relation', label: 'Relations', match: (a) => a.type === 'relation' },
  { key: 'choice', label: 'Choices', match: (a) => a.type === 'enumeration' || a.type === 'boolean' },
  { key: 'date', label: 'Dates', match: (a) => a.type === 'datetime' },
];

const SettingsPage = () => {
  const { get, put } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showReload, setShowReload] = React.useState(false);
  const [contentTypes, setContentTypes] = React.useState<ContentTypeMeta[]>([]);
  const [selection, setSelection] = React.useState<GlobalFiltersConfig>({});

  React.useEffect(() => {
    let cancelled = false;
    get('/global-filters/schema')
      .then((res) => {
        if (cancelled) return;
        setContentTypes((res.data as any)?.contentTypes ?? []);
        setSelection((res.data as any)?.config ?? {});
      })
      .catch(() => {
        toggleNotification({ type: 'danger', message: 'Could not load the configuration.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [get, toggleNotification]);

  const toggleField = (uid: string, field: string) => {
    setSelection((prev) => {
      const fields = prev[uid] ?? [];
      const next = fields.includes(field) ? fields.filter((f) => f !== field) : [...fields, field];
      const updated = { ...prev };
      if (next.length) updated[uid] = next;
      else delete updated[uid];
      return updated;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await put('/global-filters/config', { config: selection });
      setSelection((res.data as any) ?? selection);
      clearGlobalFiltersConfigCache();
      toggleNotification({ type: 'success', message: 'Configuration saved.' });
      setShowReload(true);
    } catch {
      toggleNotification({ type: 'danger', message: 'Could not save the configuration.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Page.Loading />;

  return (
    <Layouts.Root>
      <Page.Main>
        <Layouts.Header
          title="Global Filters"
          subtitle="Fields chosen here appear as filters above every Content Manager list for that content type, and stay applied as you navigate."
          primaryAction={
            <Button onClick={save} loading={saving} startIcon={<Check />}>
              Save
            </Button>
          }
        />
        <Layouts.Content>
          <Flex direction="column" alignItems="stretch" gap={4}>
            {contentTypes.map((ct) => {
              const fields = selection[ct.uid] ?? [];
              const attrs = Object.entries(ct.attributes);
              return (
                <Box
                  key={ct.uid}
                  padding={5}
                  background="neutral0"
                  hasRadius
                  shadow="tableShadow"
                  borderColor="neutral150"
                >
                  {/* header */}
                  <Flex direction="column" alignItems="flex-start">
                    <Typography variant="delta" tag="h2">
                      {ct.displayName}
                    </Typography>
                    <Typography variant="pi" textColor="neutral500">
                      {ct.uid}
                    </Typography>
                  </Flex>

                  <Box paddingTop={3} paddingBottom={4}>
                    <Divider />
                  </Box>

                  {/* filter fields, grouped by kind */}
                  <Flex direction="column" alignItems="stretch" gap={4}>
                    {GROUPS.map((group) => {
                      const groupAttrs = attrs.filter(([, a]) => group.match(a));
                      if (groupAttrs.length === 0) return null;
                      return (
                        <Box key={group.key}>
                          <Typography variant="sigma" textColor="neutral600">
                            {group.label}
                          </Typography>
                          <Flex wrap="wrap" gap={4} paddingTop={2}>
                            {groupAttrs.map(([name, attr]) => (
                              <Checkbox
                                key={name}
                                checked={fields.includes(name)}
                                onCheckedChange={() => toggleField(ct.uid, name)}
                              >
                                <Flex direction="column" alignItems="flex-start">
                                  <Typography>{prettyLabel(name)}</Typography>
                                  <Typography variant="pi" textColor="neutral500">
                                    {attrHint(attr)}
                                  </Typography>
                                </Flex>
                              </Checkbox>
                            ))}
                          </Flex>
                        </Box>
                      );
                    })}
                  </Flex>
                </Box>
              );
            })}
          </Flex>
        </Layouts.Content>

        <Modal.Root open={showReload} onOpenChange={setShowReload}>
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>Reload to apply</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Typography textColor="neutral700">
                Configuration saved. Reload the page for the changes to take
                effect across the Content Manager.
              </Typography>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onClick={() => setShowReload(false)}>
                Later
              </Button>
              <Button startIcon={<ArrowClockwise />} onClick={() => window.location.reload()}>
                Reload now
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      </Page.Main>
    </Layouts.Root>
  );
};

export default SettingsPage;
