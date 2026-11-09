const MARKER = 'chanaNavigation';

// One extra same-document entry catches ordinary Back gestures. Reuse it after
// cancellation/reload instead of adding entries each time the player says Stay.
export function createNavigationGuard({ win = window, confirmLeave, closeOverlay, onLeave, fallback }) {
  const { history, document } = win;
  let active = false, leaving = false, pending = false, restoring = false;
  let previousScrollRestoration;
  const marker = () => history.state?.[MARKER];
  const replace = value => {
    const state = { ...history.state };
    if (value) state[MARKER] = value;
    else delete state[MARKER];
    history.replaceState(state, '', win.location.href);
  };

  function arm() {
    if (!active || leaving || restoring || marker()?.kind === 'guard') return;
    const base = marker() || { hasPrevious: history.length > 1 };
    replace({ ...base, kind: 'base' });
    history.pushState({ ...history.state, [MARKER]: { ...base, kind: 'guard' } }, '', win.location.href);
  }

  function beforeUnload(event) {
    if (!active || leaving) return;
    event.preventDefault();
    event.returnValue = true;
  }

  async function ask(leave) {
    if (pending || !active || leaving) return;
    pending = true;
    const confirmed = await confirmLeave();
    pending = false;
    if (!confirmed || !active) return;
    leaving = true;
    win.removeEventListener('beforeunload', beforeUnload);
    onLeave();
    leave();
  }

  function leaveBack() {
    if (!marker()?.hasPrevious) { win.location.replace(fallback); return; }
    // history.length includes forward entries too. After returning to an old
    // landing page there may be no previous page, so a no-op Back needs an exit.
    const timer = win.setTimeout(() => win.location.replace(fallback), 800);
    win.addEventListener('pagehide', () => win.clearTimeout(timer), { once: true });
    history.go(-2);
  }

  function popstate() {
    if (leaving) return;
    const current = marker();
    if (!current) return;
    if (!active) {
      restoring = false;
      if (current.kind === 'guard') history.back();
      else replace(null);
      return;
    }
    if (current.kind === 'base') {
      // Restore the existing entry before showing the dialog, so Stay, Escape,
      // repeated Back, and closing an enlarged painting all preserve the game.
      restoring = true;
      history.forward();
    } else if (restoring) {
      restoring = false;
      if (!closeOverlay()) void ask(leaveBack);
    }
  }

  function setActive(value) {
    active = value;
    document.documentElement.classList.toggle('in-game', value);
    win.removeEventListener('beforeunload', beforeUnload);
    if (value) {
      win.addEventListener('beforeunload', beforeUnload);
      if (previousScrollRestoration === undefined) previousScrollRestoration = history.scrollRestoration;
      history.scrollRestoration = 'manual';
      // WebKit can skip entries inserted without a user gesture. On a resumed
      // page, wait for the first tap/key; joining normally retains activation.
      if (win.navigator.userActivation?.isActive) arm();
    } else {
      if (previousScrollRestoration !== undefined) history.scrollRestoration = previousScrollRestoration;
      previousScrollRestoration = undefined;
      if (marker()?.kind === 'guard') history.back();
      else if (marker()) replace(null);
    }
  }

  function click(event) {
    arm();
    const anchor = event.target.closest?.('a[href]');
    if (!active || leaving || !anchor || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const destination = new URL(anchor.href, win.location.href);
    if (!['http:', 'https:'].includes(destination.protocol) || destination.href === win.location.href) return;
    event.preventDefault();
    void ask(() => win.location.assign(destination.href));
  }

  win.addEventListener('popstate', popstate);
  document.addEventListener('click', click, true);
  document.addEventListener('touchend', arm, { passive: true, capture: true });
  document.addEventListener('keydown', arm, true);
  win.addEventListener('pageshow', event => {
    if (event.persisted) { leaving = false; setActive(active); }
  });
  return { setActive };
}
