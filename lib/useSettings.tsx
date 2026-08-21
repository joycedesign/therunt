// App-wide personalisation settings (app name, organiser role term).
//
// Publicly readable (branding shows on the sign-in screen before auth), so this
// provider fetches on mount regardless of session and live-syncs changes.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type Settings = {
  organiserName: string;
};

const DEFAULTS: Settings = { organiserName: 'The Runt' };

const SettingsContext = createContext<Settings>(DEFAULTS);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    const fetchSettings = async () => {
      const { data } = await client.from('settings').select('organiser_name').maybeSingle();
      if (active && data) {
        setSettings({ organiserName: data.organiser_name || DEFAULTS.organiserName });
      }
    };

    void fetchSettings();
    const channel = client
      .channel('settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () =>
        void fetchSettings()
      )
      .subscribe();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, []);

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  return useContext(SettingsContext);
}
