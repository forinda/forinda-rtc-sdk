/** True when running outside a browser (SSR). */
export const isServer = typeof window === "undefined";
