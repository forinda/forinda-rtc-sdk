/**
 * `withScope` — Vue composable test harness.
 *
 * Runs a composable inside an `effectScope` so `onScopeDispose` callbacks
 * fire when the test calls the returned `dispose()`. Mirrors React Testing
 * Library's `renderHook` pattern.
 */

import { effectScope, type EffectScope } from "vue";

export interface ScopedComposable<T> {
  result: T;
  scope: EffectScope;
  dispose: () => void;
}

export function withScope<T>(fn: () => T): ScopedComposable<T> {
  const scope = effectScope();
  const result = scope.run(fn) as T;
  return {
    result,
    scope,
    dispose: () => scope.stop(),
  };
}
