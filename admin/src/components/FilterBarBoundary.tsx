import * as React from 'react';

/**
 * The filter bar is injected *inside* the Content Manager's list view, so an
 * exception thrown while rendering it would take the whole list down with it —
 * leaving the admin unable to browse entries until the plugin is uninstalled.
 *
 * That matters here because the bar reads the list's context through
 * `unstable_useContentManagerContext`, an API Strapi explicitly reserves the
 * right to change. A future release that drops or reshapes it must degrade to
 * "no filter bar" rather than "no Content Manager", so every failure is caught
 * and swallowed.
 */
type Props = { children: React.ReactNode };
type State = { failed: boolean };

class FilterBarBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Left visible in the console so the cause is diagnosable, but never
    // surfaced to the editor: they didn't ask for a filter bar to break their
    // list view, and there is nothing they can do about it from here.
    // eslint-disable-next-line no-console
    console.error('[global-filters] filter bar disabled after an error:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default FilterBarBoundary;
