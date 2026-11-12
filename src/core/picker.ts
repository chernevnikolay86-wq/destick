// Element picker UI (§Picker операция). Hover-highlight → click selects an
// element; Escape cancels. The selected link/button's default action is
// suppressed. All listeners/highlights are removed on exit (teardown).

import { Engine } from './engine';

export interface PickerController {
  stop(): void;
}

export function startPicker(
  onPick: (el: Element) => void,
  onCancel: () => void,
): PickerController {
  let current: Element | null = null;
  let done = false;

  const highlight = document.createElement('div');
  Engine.markUi(highlight);
  Object.assign(highlight.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    border: '2px solid #6d5ef3',
    background: 'rgba(109,94,243,0.15)',
    boxSizing: 'border-box',
    display: 'none',
    top: '0',
    left: '0',
    margin: '0',
    padding: '0',
  });
  (document.body ?? document.documentElement).appendChild(highlight);

  const paint = (el: Element) => {
    const r = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: 'block',
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };

  const onMove = (e: MouseEvent) => {
    const el = topElementAt(e.clientX, e.clientY, highlight);
    if (!el || el === highlight) return;
    current = el;
    paint(el);
  };

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e as Event).stopImmediatePropagation?.();
    const el = current ?? topElementAt(e.clientX, e.clientY, highlight);
    teardown();
    if (el && el !== highlight) onPick(el);
    else onCancel();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      teardown();
      onCancel();
    }
  };

  function teardown(): void {
    if (done) return;
    done = true;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    highlight.remove();
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  return { stop: teardown };
}

/** Top page element at a point, ignoring our own highlight overlay. */
function topElementAt(x: number, y: number, ignore: Element): Element | null {
  const prevPe = (ignore as HTMLElement).style.pointerEvents;
  (ignore as HTMLElement).style.pointerEvents = 'none';
  let el = document.elementFromPoint(x, y);
  // Pierce OPEN shadow roots so the picker targets the internal element (and can build a
  // hostChain) instead of stopping at the outer host. Closed roots expose no shadowRoot
  // → we stop at the host (documented limitation).
  while (el && el.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  if (el === ignore) el = null;
  (ignore as HTMLElement).style.pointerEvents = prevPe;
  return el;
}
