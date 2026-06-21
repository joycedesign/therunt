// Cross-platform tee-time picker.
//
// Android: the native time dialog (fires on set/dismiss).
// iOS: a spinner inside a modal with Cancel / Set.
// Web: an <input type="time"> inside a modal with Cancel / Set.

import { createElement, useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

type Props = {
  visible: boolean;
  initial: Date;
  onConfirm: (d: Date) => void;
  onClose: () => void;
};

export default function TeeTimeModal({ visible, initial, onConfirm, onClose }: Props) {
  const [val, setVal] = useState(initial);
  useEffect(() => {
    if (visible) setVal(initial);
  }, [visible, initial]);

  if (!visible) return null;

  // Android shows its own dialog; no wrapper.
  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={val}
        mode="time"
        is24Hour={false}
        onChange={(e, d) => {
          if (e.type === 'set' && d) onConfirm(d);
          else onClose();
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Tee time</Text>

          {Platform.OS === 'web' ? (
            <WebTimeInput value={val} onChange={setVal} />
          ) : (
            <DateTimePicker
              value={val}
              mode="time"
              display="spinner"
              onChange={(_e, d) => d && setVal(d)}
              textColor="#ffffff"
            />
          )}

          <View style={styles.buttons}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.setBtn} onPress={() => onConfirm(val)}>
              <Text style={styles.setBtnText}>Set & book</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
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
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 16,
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
