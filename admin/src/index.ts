import pluginId from './pluginId';
import GlobalFilterBar from './components/GlobalFilterBar';

export default {
  register(app: any) {
    // Settings → Global Filters
    app.createSettingSection(
      {
        id: pluginId,
        intlLabel: { id: `${pluginId}.settings.section`, defaultMessage: 'Global Filters' },
      },
      [
        {
          intlLabel: { id: `${pluginId}.settings.filters`, defaultMessage: 'Filters' },
          id: `${pluginId}-filters`,
          to: `${pluginId}/filters`,
          Component: () => import('./pages/Settings'),
        },
      ]
    );
  },

  bootstrap(app: any) {
    const cm = app.getPlugin('content-manager');
    if (!cm) return;

    cm.injectComponent('listView', 'actions', {
      name: `${pluginId}-filter-bar`,
      Component: GlobalFilterBar,
    });
  },
};
