import * as React from 'react';
import {
  Accordion,
  Box,
  Button,
  Checkbox,
  Flex,
  Switch,
  Typography,
} from '@strapi/design-system';
import { Check } from '@strapi/icons';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';

import { prettyLabel } from '../utils/scope';
import {
  EMPTY_CONFIG,
  GlobalFiltersConfig,
  readConfig,
  writeConfig,
} from '../utils/configClient';

type AttrMeta = {
  type: 'relation' | 'enumeration' | 'boolean' | 'datetime' | 'text';
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
  if (attr.type === 'text') return 'contains';
  return 'yes / no';
};

const GROUPS: Array<{ key: string; label: string; match: (a: AttrMeta) => boolean }> = [
  { key: 'relation', label: 'Relations', match: (a) => a.type === 'relation' },
  { key: 'choice', label: 'Choices', match: (a) => a.type === 'enumeration' || a.type === 'boolean' },
  { key: 'date', label: 'Dates', match: (a) => a.type === 'datetime' },
  { key: 'text', label: 'Text', match: (a) => a.type === 'text' },
];

const summarize = (count: number, total: number) =>
  count === 0 ? `No filters — ${total} fields available` : `${count} of ${total} fields`;

const SettingsPage = () => {
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [loading, setLoading] = React.useState(true);
  const [contentTypes, setContentTypes] = React.useState<ContentTypeMeta[]>([]);
  const [config, setConfig] = React.useState<GlobalFiltersConfig>(EMPTY_CONFIG);
  const [open, setOpen] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    setConfig(readConfig());
    let cancelled = false;
    get('/global-filters/schema')
      .then((res) => {
        if (!cancelled) setContentTypes((res.data as any)?.contentTypes ?? []);
      })
      .catch(() => {
        toggleNotification({ type: 'danger', message: 'Could not load the content types.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [get, toggleNotification]);

  const setEnabled = (enabled: boolean) => setConfig((prev) => ({ ...prev, enabled }));

  const toggleField = (uid: string, field: string) => {
    setConfig((prev) => {
      const current = prev.fields[uid] ?? [];
      const next = current.includes(field)
        ? current.filter((f) => f !== field)
        : [...current, field];
      const fields = { ...prev.fields };
      if (next.length) fields[uid] = next;
      else delete fields[uid];
      return { ...prev, fields };
    });
  };

  const clearContentType = (uid: string) => {
    setConfig((prev) => {
      const fields = { ...prev.fields };
      delete fields[uid];
      return { ...prev, fields };
    });
  };

  const save = () => {
    if (writeConfig(config)) {
      toggleNotification({ type: 'success', message: 'Settings saved in this browser.' });
    } else {
      toggleNotification({
        type: 'danger',
        message: 'This browser refused to store the settings (private mode or blocked site data).',
      });
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
            <Button onClick={save} startIcon={<Check />}>
              Save
            </Button>
          }
        />
        <Layouts.Content>
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Box
              padding={5}
              background="neutral0"
              hasRadius
              shadow="tableShadow"
              borderColor="neutral150"
            >
              <Flex justifyContent="space-between" alignItems="center" gap={4}>
                <Flex direction="column" alignItems="flex-start" gap={1}>
                  <Typography variant="delta" tag="h2">
                    Enable global filters
                  </Typography>
                  <Typography variant="pi" textColor="neutral600">
                    While this is off, no filter bar is rendered anywhere — your field
                    selections are kept and come back when you switch it on again.
                  </Typography>
                </Flex>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={setEnabled}
                  onLabel="On"
                  offLabel="Off"
                  aria-label="Enable global filters"
                />
              </Flex>
            </Box>

            {config.enabled ? (
              <Accordion.Root value={open} onValueChange={setOpen} collapsible>
                {contentTypes.map((ct) => {
                  const selected = config.fields[ct.uid] ?? [];
                  const attrs = Object.entries(ct.attributes);
                  return (
                    <Accordion.Item key={ct.uid} value={ct.uid}>
                      <Accordion.Header>
                        <Accordion.Trigger description={summarize(selected.length, attrs.length)}>
                          {ct.displayName}
                        </Accordion.Trigger>
                        {selected.length > 0 ? (
                          <Accordion.Actions>
                            <Button
                              variant="tertiary"
                              size="S"
                              onClick={() => clearContentType(ct.uid)}
                            >
                              Clear
                            </Button>
                          </Accordion.Actions>
                        ) : null}
                      </Accordion.Header>
                      <Accordion.Content>
                        <Box padding={5}>
                          <Typography variant="pi" textColor="neutral500">
                            {ct.uid}
                          </Typography>
                          <Flex
                            direction="column"
                            alignItems="stretch"
                            gap={4}
                            paddingTop={3}
                          >
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
                                        checked={selected.includes(name)}
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
                      </Accordion.Content>
                    </Accordion.Item>
                  );
                })}
              </Accordion.Root>
            ) : null}
          </Flex>
        </Layouts.Content>
      </Page.Main>
    </Layouts.Root>
  );
};

export default SettingsPage;
