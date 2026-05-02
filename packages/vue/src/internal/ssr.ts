/** True when running on the server (no `window`). */
export const isServer = typeof window === "undefined";
