// TEMPORARY fallback root shown when the main app fails to load at module time.
// Minimal imports so it can't fail the same way.

import { ScrollView, Text } from 'react-native';

export default function ErrorApp() {
  const g = global as unknown as { __STARTUP_ERROR__?: string };
  const msg = g.__STARTUP_ERROR__ || 'Unknown startup error';
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#3a0d0d' }}
      contentContainerStyle={{ padding: 24, paddingTop: 80 }}
    >
      <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 12 }}>
        Startup error
      </Text>
      <Text selectable style={{ color: '#ffd2d2', fontSize: 12, lineHeight: 18 }}>
        {msg}
      </Text>
    </ScrollView>
  );
}
