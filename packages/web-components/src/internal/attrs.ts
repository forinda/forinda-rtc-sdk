/**
 * Read a string attribute, falling back to a default when absent.
 */
export function readString(el: Element, name: string, fallback: string): string;
export function readString(el: Element, name: string, fallback?: undefined): string | null;
export function readString(el: Element, name: string, fallback?: string): string | null {
  const value = el.getAttribute(name);
  if (value === null) return fallback ?? null;
  return value;
}

/**
 * Read a boolean attribute. Presence of the attribute (even with empty value)
 * means `true`; absence means `false`. Mirrors the HTML boolean attribute spec.
 */
export function readBoolean(el: Element, name: string): boolean {
  return el.hasAttribute(name);
}

/**
 * Read a numeric attribute. Returns `fallback` when absent or unparseable.
 */
export function readNumber(el: Element, name: string, fallback: number): number {
  const raw = el.getAttribute(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Read a JSON-encoded attribute. Returns `fallback` when absent or invalid.
 *
 * Used for structured config attributes like `ice-servers` where the consumer
 * passes a JSON literal in the markup.
 */
export function readJson<T>(el: Element, name: string, fallback: T): T {
  const raw = el.getAttribute(name);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
