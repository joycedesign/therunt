// Super-admin management of the notification schedule.
//
// Each rule is a push notification the app will send (sender + push tokens land
// in a later slice). Time-based rules fire relative to an anchor (the confirm
// deadline or the game start); event-based rules (groups_drawn / tee_booked)
// fire when that happens. Super-admin only, enforced by RLS.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Rule = {
  id: string;
  kind:
    | 'availability_reminder'
    | 'deadline_reminder'
    | 'groups_drawn'
    | 'tee_booked'
    | 'runt_select'
    | 'custom';
  title: string;
  body: string;
  enabled: boolean;
  anchor: 'deadline' | 'game' | null;
  offset_minutes: number | null;
  audience: 'all' | 'in' | 'group' | 'runt';
};

const KIND_LABEL: Record<Rule['kind'], string> = {
  availability_reminder: 'Availability reminder',
  deadline_reminder: 'Deadline reminder',
  groups_drawn: 'Groups drawn',
  tee_booked: 'Tee time booked',
  runt_select: 'Pick the organiser',
  custom: 'Custom',
};

const AUDIENCE_LABEL: Record<Rule['audience'], string> = {
  all: 'Everyone',
  in: "Who's in",
  group: "Group's players",
  runt: 'The organiser',
};

// A rule is time-based (schedulable) when it has an anchor.
const isTimed = (r: Pick<Rule, 'anchor'>) => r.anchor != null;

function timingSummary(r: Rule): string {
  if (!isTimed(r)) {
    if (r.kind === 'tee_booked') return 'When booked';
    if (r.kind === 'runt_select') return '6pm after the game';
    return 'When drawn';
  }
  const mins = Math.abs(r.offset_minutes ?? 0);
  const anchor = r.anchor === 'game' ? 'game' : 'deadline';
  if (mins === 0) return `At ${anchor}`;
  const days = mins % 1440 === 0 ? mins / 1440 : null;
  const label = days != null ? `${days} day${days === 1 ? '' : 's'}` : `${Math.round(mins / 60)} hr`;
  return `${label} before ${anchor}`;
}

export default function NotificationRulesModal({ onClose }: { onClose: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: e } = await supabase
      .from('notification_rules')
      .select('id, kind, title, body, enabled, anchor, offset_minutes, audience')
      .order('created_at');
    if (e) setError(e.message);
    else setRules((data ?? []) as Rule[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function toggle(r: Rule, value: boolean) {
    if (!supabase) return;
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: value } : x)));
    const { error: e } = await supabase
      .from('notification_rules')
      .update({ enabled: value })
      .eq('id', r.id);
    if (e) {
      setError(e.message);
      void load();
    }
  }

  async function save(r: Rule) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const payload = {
      title: r.title.trim(),
      body: r.body.trim(),
      audience: r.audience,
      anchor: r.anchor,
      offset_minutes: r.offset_minutes,
    };
    const resp = r.id
      ? await supabase.from('notification_rules').update(payload).eq('id', r.id)
      : await supabase.from('notification_rules').insert({ ...payload, kind: 'custom' });
    setBusy(false);
    if (resp.error) {
      setError(resp.error.message);
      return;
    }
    setEditing(null);
    void load();
  }

  async function remove(r: Rule) {
    if (!supabase || !r.id) return;
    setBusy(true);
    const { error: e } = await supabase.from('notification_rules').delete().eq('id', r.id);
    setBusy(false);
    if (e) setError(e.message);
    else {
      setEditing(null);
      void load();
    }
  }

  function addCustom() {
    setEditing({
      id: '',
      kind: 'custom',
      title: '',
      body: '',
      enabled: true,
      anchor: 'deadline',
      offset_minutes: -1440,
      audience: 'all',
    });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>⚠️ {error}</Text>}

        {loading ? (
          <ActivityIndicator color="#7fffb0" size="large" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.hint}>
              The schedule the app sends push notifications from. Sending goes live once the
              iOS build is ready.
            </Text>
            {rules.map((r) => (
              <View key={r.id} style={styles.rule}>
                <TouchableOpacity style={styles.ruleText} onPress={() => setEditing(r)}>
                  <Text style={styles.ruleTitle}>{r.title}</Text>
                  <Text style={styles.ruleMeta}>
                    {KIND_LABEL[r.kind]} · {timingSummary(r)} · {AUDIENCE_LABEL[r.audience]}
                  </Text>
                </TouchableOpacity>
                <Switch
                  value={r.enabled}
                  onValueChange={(v) => toggle(r, v)}
                  trackColor={{ false: '#8a9a92', true: '#22c55e' }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#8a9a92"
                  {...({ activeThumbColor: '#ffffff' } as object)}
                />
              </View>
            ))}
            <TouchableOpacity style={styles.addBtn} onPress={addCustom}>
              <Text style={styles.addBtnText}>+ Custom notification</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {editing && (
          <RuleEditor
            rule={editing}
            busy={busy}
            onChange={setEditing}
            onSave={save}
            onDelete={remove}
            onCancel={() => setEditing(null)}
          />
        )}
      </View>
    </Modal>
  );
}

function RuleEditor({
  rule,
  busy,
  onChange,
  onSave,
  onDelete,
  onCancel,
}: {
  rule: Rule;
  busy: boolean;
  onChange: (r: Rule) => void;
  onSave: (r: Rule) => void;
  onDelete: (r: Rule) => void;
  onCancel: () => void;
}) {
  const mins = Math.abs(rule.offset_minutes ?? 0);
  const unit: 'days' | 'hours' = mins % 1440 === 0 && mins !== 0 ? 'days' : 'hours';
  const amount = unit === 'days' ? mins / 1440 : Math.round(mins / 60);

  function setTiming(nextAmount: number, nextUnit: 'days' | 'hours') {
    const per = nextUnit === 'days' ? 1440 : 60;
    onChange({ ...rule, offset_minutes: -(Math.max(0, nextAmount) * per) });
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <ScrollView>
          <Text style={styles.cardTitle}>{rule.id ? 'Edit notification' : 'New notification'}</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={rule.title}
            onChangeText={(t) => onChange({ ...rule, title: t })}
            placeholder="Push title"
            placeholderTextColor="#7fa392"
            editable={!busy}
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={rule.body}
            onChangeText={(t) => onChange({ ...rule, body: t })}
            placeholder="Push message"
            placeholderTextColor="#7fa392"
            multiline
            editable={!busy}
          />
          <Text style={styles.placeholders}>
            Placeholders: {'{date}'} {'{deadline}'} {'{teetime}'} {'{tee}'} {'{group}'} {'{organiser}'}
          </Text>

          {isTimed(rule) && (
            <>
              <Text style={styles.label}>When</Text>
              <View style={styles.timingRow}>
                <TextInput
                  style={[styles.input, styles.timingInput]}
                  value={String(amount)}
                  onChangeText={(t) => setTiming(parseInt(t || '0', 10) || 0, unit)}
                  keyboardType="number-pad"
                  editable={!busy}
                />
                <Seg
                  options={['hours', 'days'] as const}
                  value={unit}
                  onPick={(u) => setTiming(amount, u)}
                />
              </View>
              <Text style={styles.label}>before</Text>
              <Seg
                options={['deadline', 'game'] as const}
                value={rule.anchor ?? 'deadline'}
                onPick={(a) => onChange({ ...rule, anchor: a })}
              />
            </>
          )}

          <Text style={styles.label}>Send to</Text>
          <Seg
            options={['all', 'in', 'group', 'runt'] as const}
            value={rule.audience}
            labels={{ all: 'Everyone', in: "Who's in", group: 'Group', runt: 'Organiser' }}
            onPick={(a) => onChange({ ...rule, audience: a })}
          />

          {validate(rule) && <Text style={styles.error}>{validate(rule)}</Text>}

          <View style={styles.cardButtons}>
            {rule.id && rule.kind === 'custom' && (
              <TouchableOpacity onPress={() => onDelete(rule)} disabled={busy}>
                <Text style={styles.delete}>Delete</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onCancel} disabled={busy}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (busy || !!validate(rule)) && styles.disabled]}
              onPress={() => onSave(rule)}
              disabled={busy || !!validate(rule)}
            >
              {busy ? (
                <ActivityIndicator color="#0b3d2e" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function validate(r: Rule): string | null {
  if (!r.title.trim() || !r.body.trim()) return 'Title and message are required.';
  return null;
}

function Seg<T extends string>({
  options,
  value,
  onPick,
  labels,
}: {
  options: readonly T[];
  value: T;
  onPick: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <TouchableOpacity
          key={o}
          style={[styles.segBtn, value === o && styles.segBtnActive]}
          onPress={() => onPick(o)}
        >
          <Text style={[styles.segText, value === o && styles.segTextActive]}>
            {labels?.[o] ?? o}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b3d2e', paddingTop: 56, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  done: { color: '#7fffb0', fontSize: 16, fontWeight: '700' },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 8 },
  content: { paddingBottom: 40 },
  hint: { color: '#9fc6b3', fontSize: 13, marginBottom: 12 },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  ruleText: { flex: 1, paddingRight: 12 },
  ruleTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  ruleMeta: { color: '#9fc6b3', fontSize: 12, marginTop: 3 },
  addBtn: {
    borderWidth: 1,
    borderColor: '#7fffb0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  addBtnText: { color: '#7fffb0', fontSize: 15, fontWeight: '700' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
  },
  cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  label: { color: '#bfe3d0', fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  placeholders: { color: '#7fa392', fontSize: 11, marginTop: 6 },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timingInput: { width: 72, textAlign: 'center' },
  seg: { flexDirection: 'row', gap: 8, flex: 1 },
  segBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segBtnActive: { backgroundColor: '#7fffb0' },
  segText: { color: '#7fffb0', fontSize: 13, fontWeight: '700' },
  segTextActive: { color: '#0b3d2e' },
  cardButtons: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 18 },
  delete: { color: '#ff9b9b', fontSize: 15, fontWeight: '600' },
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
