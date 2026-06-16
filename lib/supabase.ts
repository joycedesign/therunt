// Supabase client for The Runt.
//
// Reads credentials from environment variables prefixed with EXPO_PUBLIC_,
// which Expo automatically inlines into the app bundle at build time.
// The anon (public) key is safe to ship in a client app — row-level
// security on the database is what protects data, not key secrecy.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// True once both values are present in .env — lets the UI show a helpful
// "not configured yet" message instead of crashing on first launch.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// On native we persist the auth session with AsyncStorage; on web the
// Supabase client uses localStorage by default, so we leave storage unset.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
