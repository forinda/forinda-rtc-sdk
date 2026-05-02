/**
 * Dispatch a typed `CustomEvent` from a host element.
 *
 * `bubbles: false` matches DOM conventions for status-style events (load,
 * error, change) — consumers attach directly to the element they instantiated,
 * not to ancestors. `composed: true` is set defensively so dispatches from
 * inside shadow roots still reach the host if a listener moves there later.
 */
export function dispatchTypedEvent<T>(
  el: EventTarget,
  type: string,
  detail: T,
): boolean {
  const event = new CustomEvent<T>(type, {
    bubbles: false,
    composed: true,
    detail,
  });
  return el.dispatchEvent(event);
}
