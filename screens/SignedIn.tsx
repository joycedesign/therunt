// Signed-in shell for The Runt: header, tab switch, and sign-out.
// Hosts the Availability and Profile tabs.

import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';
import AvailabilityScreen from './AvailabilityScreen';
import MembersScreen from './MembersScreen';
import ProfileScreen from './ProfileScreen';

type Tab = 'availability' | 'members' | 'profile';

type Props = {
  player: Player | null;
  email: string;
  refreshPlayer: () => void;
};

export default function SignedIn({ player, email, refreshPlayer }: Props) {
  const [tab, setTab] = useState<Tab>('availability');
  const greeting = player?.preferred_name || player?.name || 'golfer';

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>The Runt 🐐</Text>
        <Text style={styles.subtitle}>Hi, {greeting}</Text>

        <View style={styles.tabs}>
          <TabButton
            label="Availability"
            active={tab === 'availability'}
            onPress={() => setTab('availability')}
          />
          <TabButton
            label="Members"
            active={tab === 'members'}
            onPress={() => setTab('members')}
          />
          <TabButton
            label="Profile"
            active={tab === 'profile'}
            onPress={() => setTab('profile')}
          />
        </View>

        <View style={styles.body}>
          {tab === 'availability' && <AvailabilityScreen player={player} />}
          {tab === 'members' && <MembersScreen player={player} />}
          {tab === 'profile' && (
            <ProfileScreen player={player} email={email} onProfileSaved={refreshPlayer} />
          )}
        </View>

        <TouchableOpacity onPress={() => supabase?.auth.signOut()}>
          <Text style={styles.link}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b3d2e',
    alignItems: 'center',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 15, color: '#bfe3d0', marginTop: 2, marginBottom: 20 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: { backgroundColor: '#7fffb0' },
  tabText: { color: '#bfe3d0', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#0b3d2e' },
  body: { flex: 1 },
  link: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 16 },
});
