import { registerRootComponent } from 'expo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: (m: string) => any;

// Install the global JS error catcher before the app graph loads (temporary).
try {
  require('./lib/installErrorHandler');
} catch {
  // ignore
}

const g = global as unknown as { __STARTUP_ERROR__?: string };

// Load the app, but if any module in its graph throws at load, fall back to a
// screen that shows the error — release-only startup failures were otherwise
// white-screening with no way to read the cause. (Temporary.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Root: any;
try {
  Root = require('./App').default;
} catch (e) {
  const err = e as { stack?: string; message?: string };
  g.__STARTUP_ERROR__ = err?.stack || err?.message || String(e);
  Root = require('./ErrorApp').default;
}

registerRootComponent(Root);
