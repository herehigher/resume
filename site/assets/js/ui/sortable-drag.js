const THRESHOLD = 6;
const DURATION = 160;

// Logical rows stay in place throughout the gesture. Only their headings move;
// hit testing therefore never reads an animated transform's visual rectangle.
export function createSortableDrag(doc = document) {
  const win = doc.defaultView;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let active = null;
  let landing = null;
  let landingTarget = null;
  let frame = 0;
  let landingTimer = 0;
  let destroyed = false;

  function clearLanding() {
    win.clearTimeout(landingTimer);
    landing?.remove(); landing = null; landingTarget = null;
  }
  function visible(session) {
    return session.adapter.valid() && session.adapter.container.isConnected
      && session.adapter.container.getClientRects().length > 0;
  }
  function position(element, rect) {
    element.style.left = `${rect.left}px`; element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`; element.style.height = `${rect.height}px`;
  }
  function scrollBounds(session) {
    const rect = session.panel.getBoundingClientRect();
    return { top: Math.max(0, rect.top), bottom: Math.min(win.innerHeight, rect.bottom), left: rect.left, right: rect.right };
  }
  function geometry(session) {
    return session.rows.map((row) => row.element.getBoundingClientRect());
  }
  function inside(session) {
    const list = session.adapter.container.getBoundingClientRect();
    const panel = scrollBounds(session);
    return session.x >= Math.max(list.left, panel.left) && session.x <= Math.min(list.right, panel.right)
      && session.y >= Math.max(list.top, panel.top) && session.y <= Math.min(list.bottom, panel.bottom);
  }
  function paint(session, rects) {
    const order = session.rows.map((_row, index) => index);
    order.splice(session.to, 0, order.splice(session.from, 1)[0]);
    order.forEach((index, slot) => {
      if (index === session.from) return;
      session.rows[index].header.style.transform = `translateY(${rects[slot].top - rects[index].top}px)`;
    });
    position(session.placeholder, { ...rects[session.to].toJSON(), height: session.height });
    session.placeholder.classList.toggle('is-outside', !inside(session));
    session.float.style.left = `${Math.max(8, Math.min(win.innerWidth - session.width - 8, session.x - session.offsetX))}px`;
    session.float.style.top = `${Math.max(8, Math.min(win.innerHeight - session.height - 8, session.y - session.offsetY))}px`;
  }
  function selectDestination(session, rects) {
    if (session.ready && session.selecting && inside(session)) {
      session.to = rects.filter((rect, index) => index !== session.from && session.y >= rect.top + rect.height / 2).length;
    }
  }
  function tick(time) {
    frame = 0;
    const session = active;
    if (!session?.started) return;
    if (!visible(session)) { cancel(); return; }
    const panel = scrollBounds(session);
    const elapsed = Math.min(32, time - (session.time || time)); session.time = time;
    if (session.x >= panel.left && session.x <= panel.right) {
      const edge = Math.min(56, (panel.bottom - panel.top) / 3);
      const speed = session.y < panel.top + edge ? -Math.min(1, (panel.top + edge - session.y) / edge)
        : session.y > panel.bottom - edge ? Math.min(1, (session.y - panel.bottom + edge) / edge) : 0;
      const previousScroll = session.panel.scrollTop;
      session.panel.scrollTop += speed * elapsed * 0.7;
      if (session.panel.scrollTop !== previousScroll) session.selecting = true;
    }
    const rects = geometry(session);
    // The first frame only establishes the compact layout and original slot.
    // A later pointer move (or actual scrolling) enables destination selection.
    selectDestination(session, rects);
    paint(session, rects);
    session.ready = true;
    frame = win.requestAnimationFrame(tick);
  }
  function start(session) {
    const before = session.rows[session.from].header.getBoundingClientRect();
    session.started = true;
    session.panel.classList.add('sortable-drag-panel');
    session.adapter.collapse();
    // Retain the viewport anchor even when compacting earlier long cards would
    // otherwise require a negative scroll offset. The spacer is transient UI.
    const after = session.rows[session.from].header.getBoundingClientRect();
    const desired = session.panel.scrollTop + after.top - before.top;
    if (desired < 0) {
      session.spacer = doc.createElement('div'); session.spacer.className = 'sortable-anchor-space';
      session.spacer.style.height = `${-desired}px`;
      session.adapter.container.before(session.spacer);
    }
    const maximum = session.panel.scrollHeight - session.panel.clientHeight;
    if (desired > maximum) {
      session.tailSpace = doc.createElement('div'); session.tailSpace.className = 'sortable-anchor-space';
      session.tailSpace.style.height = `${desired - maximum}px`; session.adapter.container.after(session.tailSpace);
    }
    session.panel.scrollTop = Math.max(0, desired);
    const compact = session.rows[session.from].header.getBoundingClientRect();
    session.height = compact.height;
    session.width = Math.min(compact.width, win.innerWidth - 16);
    session.offsetX = Math.min(session.x - compact.left, compact.width - 12);
    session.offsetY = Math.min(session.downY - before.top, compact.height - 8);
    session.float = doc.createElement('div'); session.float.className = 'sortable-drag-float';
    session.float.lang = session.adapter.locale; session.float.textContent = session.adapter.summary();
    session.float.setAttribute('aria-hidden', 'true');
    session.float.style.width = `${session.width}px`; session.float.style.height = `${compact.height}px`;
    session.placeholder = doc.createElement('div'); session.placeholder.className = 'sortable-placeholder';
    session.placeholder.setAttribute('aria-hidden', 'true');
    doc.body.append(session.placeholder, session.float);
    session.rows.forEach((row) => { row.header.classList.add('sortable-drag-heading'); });
    session.rows[session.from].header.classList.add('sortable-drag-source');
    session.adapter.container.classList.add('sortable-drag-list');
    paint(session, geometry(session));
    frame = win.requestAnimationFrame(tick);
  }
  function finish(commit, animate = true) {
    const session = active;
    if (!session) { if (!animate) clearLanding(); return; }
    active = null; win.cancelAnimationFrame(frame); frame = 0;
    const permitted = commit && session.started && session.ready && visible(session) && inside(session);
    session.rows.forEach((row) => {
      row.header.style.removeProperty('transform');
      row.header.classList.remove('sortable-drag-heading', 'sortable-drag-source');
    });
    session.adapter.container.classList.remove('sortable-drag-list');
    session.panel.classList.remove('sortable-drag-panel');
    session.placeholder?.remove(); session.spacer?.remove(); session.tailSpace?.remove();
    if (session.handle.hasPointerCapture(session.pointerId)) session.handle.releasePointerCapture(session.pointerId);
    // Data, pagination and save are committed synchronously before any landing.
    const changed = permitted && session.from !== session.to && session.adapter.move(session.from, session.to);
    const row = session.adapter.row(changed ? session.to : session.from);
    if (!session.float) return;
    if (!animate || reducedMotion.matches || !row?.element.isConnected || !row.header.getClientRects().length) {
      session.float.remove(); return;
    }
    clearLanding(); landing = session.float; landingTarget = row.element;
    landing.classList.add('is-landing');
    position(landing, row.header.getBoundingClientRect());
    landingTimer = win.setTimeout(clearLanding, DURATION + 30);
  }
  function cancel() { finish(false, false); }
  function pointerMove(event) {
    const session = active;
    if (!session || event.pointerId !== session.pointerId) return;
    session.x = event.clientX; session.y = event.clientY;
    if (session.started) session.selecting = true;
    if (!visible(session)) { cancel(); return; }
    if (!session.started && Math.hypot(session.x - session.downX, session.y - session.downY) >= THRESHOLD) start(session);
    if (session.started) event.preventDefault();
  }
  function pointerUp(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    active.x = event.clientX; active.y = event.clientY;
    if (active.started && visible(active)) selectDestination(active, geometry(active));
    finish(true);
  }
  function pointerCancel(event) { if (active?.pointerId === event.pointerId) cancel(); }
  function keyDown(event) {
    if (event.key === 'Escape' && active) { event.preventDefault(); finish(false); }
    else if (active && event.key.startsWith('Arrow')) event.preventDefault();
  }
  function visibilityChange() { if (doc.hidden) cancel(); }
  const observer = new win.MutationObserver((records) => {
    const target = active?.adapter.container || landingTarget;
    if (records.some((record) => target && record.target.contains(target)
      && (record.attributeName === 'data-mobile-mode' || record.target.hidden))
      || (active && !visible(active))) cancel();
  });
  observer.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-mobile-mode'] });
  win.addEventListener('pointermove', pointerMove, { passive: false });
  win.addEventListener('pointerup', pointerUp);
  win.addEventListener('pointercancel', pointerCancel);
  win.addEventListener('lostpointercapture', pointerCancel);
  win.addEventListener('blur', cancel);
  win.addEventListener('beforeprint', cancel);
  doc.addEventListener('keydown', keyDown, true);
  doc.addEventListener('visibilitychange', visibilityChange);
  reducedMotion.addEventListener('change', cancel);
  return {
    begin(event, adapter, from) {
      if (destroyed || active || event.button !== 0 || !event.isPrimary || !adapter.valid()) return;
      clearLanding();
      const rows = adapter.rows();
      const handle = rows[from]?.handle;
      if (!handle || handle.disabled || rows.length < 2) return;
      event.stopPropagation();
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(event.pointerId);
      active = { adapter, rows, handle, from, to: from, pointerId: event.pointerId,
        panel: adapter.container.closest('.editor-panel') || doc.scrollingElement,
        downX: event.clientX, downY: event.clientY, x: event.clientX, y: event.clientY,
        started: false, ready: false };
    },
    cancel,
    cancelList(container) { if (active?.adapter.container === container) cancel(); else clearLanding(); },
    get busy() { return Boolean(active); },
    destroy() {
      destroyed = true; cancel(); clearLanding(); observer.disconnect();
      win.removeEventListener('pointermove', pointerMove); win.removeEventListener('pointerup', pointerUp);
      win.removeEventListener('pointercancel', pointerCancel); win.removeEventListener('lostpointercapture', pointerCancel);
      win.removeEventListener('blur', cancel); win.removeEventListener('beforeprint', cancel);
      doc.removeEventListener('keydown', keyDown, true); doc.removeEventListener('visibilitychange', visibilityChange);
      reducedMotion.removeEventListener('change', cancel);
    }
  };
}
