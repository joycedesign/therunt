// TEMPORARY debug aid: capture any uncaught JS error so the app can show it
// on-screen (useful for diagnosing release-only startup failures without a
// device cable). Imported first in index.ts so it's installed before the app's
// module graph evaluates. Remove once the startup issue is resolved.

const g = global as unknown as {
  ErrorUtils?: {
    getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
    setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
  };
  __STARTUP_ERROR__?: string;
};

try {
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((e: unknown, isFatal?: boolean) => {
    try {
      const err = e as { stack?: string; message?: string };
      g.__STARTUP_ERROR__ = err?.stack || err?.message || String(e);
    } catch {
      // ignore
    }
    if (prev) prev(e, isFatal);
  });
} catch {
  // ignore
}

export {};
