import * as React from 'react';
import { createPortal } from 'react-dom';

import FilterBar from './FilterBar';

/**
 * The Content Manager only exposes the `listView.actions` toolbar zone for
 * injection (rendered on the right of the Search/Filters bar). We want the
 * filter controls on their own full-width row *above* that bar, so we render
 * an invisible marker in the actions zone and portal the real filter UI into
 * a container inserted just before the action bar inside <main>.
 */
const GlobalFilterBar = () => {
  const markerRef = React.useRef<HTMLSpanElement>(null);
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const main = marker.closest('main#main-content') || marker.closest('main');
    if (!main) return;

    // Walk up to the direct child of <main> that holds our marker — that's the
    // Search/Filters action bar. Insert our row right before it.
    let actionBar: HTMLElement | null = marker;
    while (actionBar && actionBar.parentElement !== main) {
      actionBar = actionBar.parentElement as HTMLElement;
    }
    if (!actionBar || actionBar.parentElement !== main) return;

    const container = document.createElement('div');
    container.setAttribute('data-global-filters-bar', '');
    // Match the native action bar's own horizontal padding exactly so our row
    // shares its left/right edge (both are direct children of <main>).
    const cs = window.getComputedStyle(actionBar);
    container.style.paddingLeft = cs.paddingLeft;
    container.style.paddingRight = cs.paddingRight;
    main.insertBefore(container, actionBar);
    setHost(container);

    return () => {
      container.remove();
      setHost(null);
    };
  }, []);

  return (
    <>
      <span ref={markerRef} style={{ display: 'none' }} aria-hidden="true" />
      {host ? createPortal(<FilterBar />, host) : null}
    </>
  );
};

export default GlobalFilterBar;
