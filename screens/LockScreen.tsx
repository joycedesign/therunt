// Shown when the app is locked and needs a biometric unlock.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { biometricLabel } from '../lib/biometrics';

export default function LockScreen({ onUnlock }: { onUnlock: () => Promise<boolean> }) {
  const [label, setLabel] = useState('Biometric unlock');
  const [failed, setFailed] = useState(false);
  const prompted = useRef(false);

  useEffect(() => {
    void biometricLabel().then(setLabel);
    // Auto-prompt once when the lock screen appears.
    if (!prompted.current) {
      prompted.current = true;
      void tryUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryUnlock() {
    const ok = await onUnlock();
    setFailed(!ok);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.lock}>🔒</Text>
      <Text style={styles.title}>The Runt is locked</Text>
      <TouchableOpacity style={styles.button} onPress={tryUnlock}>
        <Text style={styles.buttonText}>Unlock with {label}</Text>
      </TouchableOpacity>
      {failed && <Text style={styles.hint}>Unlock cancelled — tap to try again.</Text>}
      <TouchableOpacity onPress={() => supabase?.auth.signOut()}>
        <Text style={styles.link}>Sign out instead</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b3d2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lock: { fontSize: 48, marginBottom: 12 },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 28 },
  button: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  buttonText: { color: '#0b3d2e', fontSize: 16, fontWeight: '700' },
  hint: { color: '#ffd2d2', fontSize: 13, marginTop: 16 },
  link: { color: '#bfe3d0', fontSize: 15, marginTop: 24 },
});
