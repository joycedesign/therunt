// Admin settings for The Runt (admin-only "Admin" tab).
//
// For now this hosts the Events manager: admins create special dates that show
// a name instead of the Saturday date. A 'golf' event behaves like a normal
// golf day; an 'other' (non-golf) event is RSVP-only with optional +1 / guests.

import { createElement, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';

type EventRow = {
  id: string;
  start_date: string;
  title: string | null;
  event_type: 'golf' | 'other';
  allow_guests: boolean;
  event_time: string | null;
  emoji: string | null;
};

// A small curated palette for non-golf events (no full emoji keyboard needed).
const EVENT_EMOJIS = [
  '🎉', '🥳', '🍺', '🍻', '🍷', '🍽️',
  '🎳', '🎣', '🎤', '🎸', '🎯', '🏆',
  '🎄', '🎂', '☕', '🔥',
];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function prettyTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, '0')}${ampm}`;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function prettyDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminScreen({
  player,
  header,
}: {
  player: Player | null;
  header?: ReactNode;
}) {
  const isAdmin = player?.is_admin ?? false;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'golf' | 'other'>('golf');
  const [date, setDate] = useState<Date>(new Date());
  const [allowGuests, setAllowGuests] = useState(false);
  const [emoji, setEmoji] = useState('🎉');
  const [hasTime, setHasTime] = useState(false);
  const [time, setTime] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { data, error: e } = await supabase
      .from('weeks')
      .select('id, start_date, title, event_type, allow_guests, event_time, emoji')
      .not('event_type', 'is', null)
      .order('start_date');
    if (e) {
      setError(e.message);
      return;
    }
    setEvents((data ?? []) as EventRow[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openCreate() {
    setName('');
    setType('golf');
    setDate(new Date());
    setAllowGuests(false);
    setEmoji('🎉');
    setHasTime(false);
    setTime(new Date());
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    if (!supabase) return;
    const title = name.trim();
    if (!title) {
      setError('Enter an event name.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('weeks').insert({
      start_date: ymd(date),
      title,
      event_type: type,
      allow_guests: type === 'other' ? allowGuests : false,
      emoji: type === 'other' ? emoji : null,
      event_time: hasTime ? hhmm(time) : null,
      status: 'pending',
    });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setModalOpen(false);
    void load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    const { error: e } = await supabase.from('weeks').delete().eq('id', id);
    if (e) setError(e.message);
    else void load();
  }

  if (loading) {
    return (
      <View style={styles.scroll}>
        {header}
        <ActivityIndicator color="#7fffb0" size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.scroll}>
        {header}
        <Text style={styles.empty}>Admins only.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7fffb0" />
        }
      >
        {header}
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Events ({events.length})</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>+ New event</Text>
          </TouchableOpacity>
        </View>

        {error && !modalOpen && <Text style={styles.error}>⚠️ {error}</Text>}

        {events.length === 0 ? (
          <Text style={styles.empty}>
            No events yet. Add a one-off golf day or a social gathering.
          </Text>
        ) : (
          events.map((ev) => (
            <View key={ev.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>
                  {ev.event_type === 'other' && ev.emoji ? `${ev.emoji} ` : ''}
                  {ev.title || '(untitled)'}
                  <Text style={styles.badge}>
                    {'  '}
                    {ev.event_type === 'golf' ? '⛳ Golf' : 'Non-golf'}
                  </Text>
                </Text>
                <Text style={styles.sub}>
                  {prettyDate(ev.start_date)}
                  {ev.event_time ? `, ${prettyTime(ev.event_time)}` : ''}
                  {ev.event_type === 'other' && ev.allow_guests ? '  ·  guests' : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => remove(ev.id)} hitSlop={8}>
                <Text style={styles.delete}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <Text style={styles.hint}>
          Events appear on the Availability tab by name instead of a date.
        </Text>
      </ScrollView>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New event</Text>

            <TextInput
              style={styles.input}
              placeholder="Event name (e.g. Xmas Scramble)"
              placeholderTextColor="#7fa392"
              value={name}
              onChangeText={setName}
              editable={!busy}
              autoFocus
            />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              <TypeButton label="⛳ Golf" active={type === 'golf'} onPress={() => setType('golf')} />
              <TypeButton
                label="🎉 Non-golf"
                active={type === 'other'}
                onPress={() => setType('other')}
              />
            </View>

            <Text style={styles.label}>Date</Text>
            <DatePicker value={date} onChange={setDate} />

            {type === 'other' && (
              <>
                <Text style={styles.label}>Emoji</Text>
                <View style={styles.emojiGrid}>
                  {EVENT_EMOJIS.map((em) => (
                    <TouchableOpacity
                      key={em}
                      style={[styles.emojiBtn, emoji === em && styles.emojiBtnActive]}
                      onPress={() => setEmoji(em)}
                    >
                      <Text style={styles.emojiText}>{em}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Add a time</Text>
                  <Switch
                    value={hasTime}
                    onValueChange={setHasTime}
                    trackColor={{ false: '#8a9a92', true: '#22c55e' }}
                    thumbColor="#ffffff"
                    ios_backgroundColor="#8a9a92"
                    {...({ activeThumbColor: '#ffffff' } as object)}
                    disabled={busy}
                  />
                </View>
                {hasTime && <TimePicker value={time} onChange={setTime} />}

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Allow guests</Text>
                  <Switch
                    value={allowGuests}
                    onValueChange={setAllowGuests}
                    trackColor={{ false: '#8a9a92', true: '#22c55e' }}
                    thumbColor="#ffffff"
                    ios_backgroundColor="#8a9a92"
                    {...({ activeThumbColor: '#ffffff' } as object)}
                    disabled={busy}
                  />
                </View>
              </>
            )}

            {error && modalOpen && <Text style={styles.error}>⚠️ {error}</Text>}

            <View style={styles.modalButtons}>
              <View style={styles.flexSpacer} />
              <TouchableOpacity onPress={() => setModalOpen(false)} disabled={busy}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, busy && styles.disabled]}
                onPress={save}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#0b3d2e" />
                ) : (
                  <Text style={styles.saveBtnText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function TypeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.typeBtn, active && styles.typeBtnActive]} onPress={onPress}>
      <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DatePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [showAndroid, setShowAndroid] = useState(false);
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value: ymd(value),
      onChange: (e: { target: { value: string } }) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        if (!y) return;
        onChange(new Date(y, m - 1, d));
      },
      style: {
        fontSize: 16,
        padding: 12,
        borderRadius: 10,
        border: 'none',
        width: '100%',
        boxSizing: 'border-box',
        marginBottom: 4,
      },
    });
  }
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="compact"
        onChange={(_e, d) => d && onChange(d)}
        themeVariant="dark"
      />
    );
  }
  return (
    <>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowAndroid(true)}>
        <Text style={styles.dateBtnText}>{prettyDate(ymd(value))} — tap to change</Text>
      </TouchableOpacity>
      {showAndroid && (
        <DateTimePicker
          value={value}
          mode="date"
          onChange={(e, d) => {
            setShowAndroid(false);
            if (e.type === 'set' && d) onChange(d);
          }}
        />
      )}
    </>
  );
}

function TimePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [showAndroid, setShowAndroid] = useState(false);
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'time',
      value: hhmm(value),
      onChange: (e: { target: { value: string } }) => {
        const [h, m] = e.target.value.split(':').map(Number);
        if (Number.isNaN(h)) return;
        const d = new Date(value);
        d.setHours(h, m, 0, 0);
        onChange(d);
      },
      style: {
        fontSize: 16,
        padding: 12,
        borderRadius: 10,
        border: 'none',
        width: '100%',
        boxSizing: 'border-box',
        marginTop: 8,
      },
    });
  }
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="compact"
        onChange={(_e, d) => d && onChange(d)}
        themeVariant="dark"
      />
    );
  }
  return (
    <>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowAndroid(true)}>
        <Text style={styles.dateBtnText}>{prettyTime(hhmm(value))} — tap to change</Text>
      </TouchableOpacity>
      {showAndroid && (
        <DateTimePicker
          value={value}
          mode="time"
          is24Hour={false}
          onChange={(e, d) => {
            setShowAndroid(false);
            if (e.type === 'set' && d) onChange(d);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: { color: '#ffffff', fontSize: 18, fontWeight: '700', flexShrink: 1 },
  addBtn: { backgroundColor: '#7fffb0', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  addBtnText: { color: '#0b3d2e', fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rowText: { flex: 1, paddingRight: 12 },
  name: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  badge: { color: '#9fc6b3', fontSize: 13, fontWeight: '400' },
  sub: { color: '#9fc6b3', fontSize: 12, marginTop: 2 },
  delete: { color: '#ff9b9b', fontSize: 14, fontWeight: '600' },
  empty: { color: '#bfe3d0', fontSize: 14, textAlign: 'center', marginTop: 24 },
  hint: { color: '#6f9684', fontSize: 12, textAlign: 'center', marginTop: 12 },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 12,
  },
  label: { color: '#bfe3d0', fontSize: 13, marginBottom: 8, marginTop: 4 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: '#7fffb0' },
  typeBtnText: { color: '#7fffb0', fontSize: 15, fontWeight: '700' },
  typeBtnTextActive: { color: '#0b3d2e' },
  dateBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  dateBtnText: { color: '#0b3d2e', fontSize: 16, fontWeight: '600' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnActive: { borderColor: '#7fffb0', backgroundColor: 'rgba(127,255,176,0.2)' },
  emojiText: { fontSize: 22 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  toggleLabel: { color: '#ffffff', fontSize: 14, flex: 1, paddingRight: 12 },
  modalButtons: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18 },
  flexSpacer: { flex: 1 },
  cancel: { color: '#bfe3d0', fontSize: 15 },
  saveBtn: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#0b3d2e', fontSize: 15, fontWeight: '700' },
});
