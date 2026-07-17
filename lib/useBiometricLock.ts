// Locks the app behind a biometric prompt when it *starts* with a saved
// session (a returning user) and Face ID / Touch ID unlock is enabled.
//
// It decides once, right after the initial session check — so signing in
// interactively during this run does NOT trigger a lock (you just
// authenticated). Face ID effectively replaces the login page for returning
// users, rather than stacking on top of a fresh sign-in.

import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticate, biometricAvailable, biometricEnabled } from './biometrics';

export function useBiometricLock(loading: boolean, hasSession: boolean) {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (loading || decided.current) return;
    decided.current = true;

    if (!hasSession) {
      setReady(true);
      return;
    }

    let active = true;
    (async () => {
      const shouldLock = (await biometricEnabled()) && (await biometricAvailable());
      if (!active) return;
      setLocked(shouldLock);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [loading, hasSession]);

  const unlock = useCallback(async () => {
    const ok = await authenticate();
    if (ok) setLocked(false);
    return ok;
  }, []);

  return { ready, locked, unlock };
}
