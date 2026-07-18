// Cross-platform tee-time + starting-tee picker.
//
// A modal with a 1st/11th tee toggle and a time control:
//  - web: <input type="time">
//  - iOS: inline spinner
//  - Android: a button that opens the native time dialog

import { createElement, useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

type Props = {
  visible: boolean;
  initial: Date;
  initialTee: number;
  onConfirm: (d: Date, tee: number) => void;
  onClose: () => void;
};

export default function TeeTimeModal({ visible, initial, initialTee, onConfirm, onClose }: Props) {
  const [val, setVal] = useState(initial);
  const [tee, setTee] = useState(initialTee);
  const [showAndroid, setShowAndroid] = useState(false);

  useEffect(() => {
    if (visible) {
      setVal(initial);
      setTee(initialTee);
    }
  }, [visible, initial, initialTee]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Tee time</Text>

          <Text style={styles.label}>Starting tee</Text>
          <View style={styles.teeRow}>
            <TeeButton label="1st tee" active={tee === 1} onPress={() => setTee(1)} />
            <TeeButton label="11th tee" active={tee === 11} onPress={() => setTee(11)} />
          </View>

          <Text style={styles.label}>Time</Text>
          {Platform.OS === 'web' ? (
            <WebTimeInput value={val} onChange={setVal} />
          ) : Platform.OS === 'ios' ? (
            <DateTimePicker
              value={val}
              mode="time"
              display="spinner"
              onChange={(_e, d) => d && setVal(d)}
              textColor="#ffffff"
            />
          ) : (
            <>
              <TouchableOpacity style={styles.timeBtn} onPress={() => setShowAndroid(true)}>
                <Text style={styles.timeBtnText}>{formatTime(val)} — tap to change</Text>
              </TouchableOpacity>
              {showAndroid && (
                <DateTimePicker
                  value={val}
                  mode="time"
                  is24Hour={false}
                  onChange={(e, d) => {
                    setShowAndroid(false);
                    if (e.type === 'set' && d) setVal(d);
                  }}
                />
              )}
            </>
          )}

          <View style={styles.buttons}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.setBtn} onPress={() => onConfirm(val, tee)}>
              <Text style={styles.setBtnText}>Set &amp; book</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TeeButton({
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
      style={[styles.teeBtn, active && styles.teeBtnActive]}
      onPress={onPress}
    >
      <Text style={[styles.teeBtnText, active && styles.teeBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatTime(d: Date): string {
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const m = d.getMinutes();
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function WebTimeInput({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const hh = String(value.getHours()).padStart(2, '0');
  const mm = String(value.getMinutes()).padStart(2, '0');
  return createElement('input', {
    type: 'time',
    value: `${hh}:${mm}`,
    onChange: (e: { target: { value: string } }) => {
      const [h, m] = e.target.value.split(':').map(Number);
      if (Number.isNaN(h)) return;
      const d = new Date(value);
      d.setHours(h, m, 0, 0);
      onChange(d);
    },
    style: {
      fontSize: 18,
      padding: 12,
      borderRadius: 8,
      border: 'none',
      width: '100%',
      boxSizing: 'border-box',
    },
  });
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  label: { color: '#bfe3d0', fontSize: 13, marginBottom: 8, marginTop: 4 },
  teeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  teeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  teeBtnActive: { backgroundColor: '#7fffb0' },
  teeBtnText: { color: '#7fffb0', fontSize: 15, fontWeight: '700' },
  teeBtnTextActive: { color: '#0b3d2e' },
  timeBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  timeBtnText: { color: '#0b3d2e', fontSize: 16, fontWeight: '600' },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 18,
  },
  cancel: { color: '#bfe3d0', fontSize: 15 },
  setBtn: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  setBtnText: { color: '#0b3d2e', fontSize: 15, fontWeight: '700' },
});
