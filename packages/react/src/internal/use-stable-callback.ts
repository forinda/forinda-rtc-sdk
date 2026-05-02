import { useCallback, useRef } from "react";

/**
 * Wraps a callback so its identity stays stable across renders, but every
 * call dispatches to the latest function. Useful for passing handlers into
 * `useSyncExternalStore` `subscribe` functions or class APIs that capture
 * the callback once.
 */
export function useStableCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}
