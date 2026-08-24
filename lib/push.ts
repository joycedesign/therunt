// Expo push registration.
//
// Remote push only works on a real native build (not Expo Go, not web), so we
// guard hard and treat everything as best-effort — registration must never
// block or crash the app.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canPush = Platform.OS !== 'web' && !isExpoGo;

// How a notification shows while the app is foregrounded.
if (canPush) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPush(playerId: string): Promise<void> {
  if (!canPush || !Device.isDevice || !supabase) return;
  try {
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
