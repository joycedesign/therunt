// Expo push registration.
//
// Remote push only works on a real native build (not Expo Go, not web), so we
// guard hard and treat everything as best-effort — registration must never
// block or crash the app. Nothing runs at import time: all native calls happen
// inside registerForPush (called from an effect, after mount), wrapped in
// try/catch, so a failure here can never take down app startup.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canPush = Platform.OS !== 'web' && !isExpoGo;

let handlerSet = false;

export async function registerForPush(playerId: string): Promise<void> {
  if (!canPush || !Device.isDevice || !supabase) return;
  try {
    // How a notification shows while the app is foregrounded (set once).
    if (!handlerSet) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerSet = true;
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await supabase
      .from('push_tokens')
      .upsert({ token, player_id: playerId, platform: Platform.OS }, { onConflict: 'token' });
  } catch {
    // best-effort — never surface push-registration failures to the user
  }
}
