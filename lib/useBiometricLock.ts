// Locks the app behind a biometric prompt on launch when the user has
// enabled Face ID / Touch ID unlock and there's a saved session.

import { useCallback, useEffect, useState } from 'react';
import { authenticate, biometricAvailable, biometricEnabled } from './biometrics';

export function useBiometricLock(hasSession: boolean) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let active = true;
    // Hold (spinner) until we've decided whether to lock, so the app can't
    // render before the lock check finishes.
    if (hasSession) setReady(false);
    (async () => {
      if (!hasSession) {
        if (active) {
          setLocked(false);
          setReady(true);
        }
        return;
      }
      const shouldLock = (await biometricEnabled()) && (await biometricAvailable());
      if (!active) return;
      setLocked(shouldLock);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [hasSession]);

  const unlock = useCallback(async () => {
    const ok = await authenticate();
    if (ok) setLocked(false);
    return ok;
  }, []);

  return { ready, locked, unlock };
}
