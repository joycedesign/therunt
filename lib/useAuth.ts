// Auth + profile state for The Runt.
//
// Tracks the Supabase auth session and the matching `players` profile row,
// and keeps them in sync as the user signs in / out.

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Player = {
  id: string;
  email: string;
  name: string;
  preferred_name: string | null;
  status: 'active' | 'inactive' | 'blocked';
  default_available: boolean;
};

export type AuthState = {
  loading: boolean;
  session: Session | null;
  player: Player | null;
  refreshPlayer: () => Promise<void>;
};

export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  // Track the auth session.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the profile row whenever the session changes.
  const loadPlayer = useCallback(async (userId: string | undefined) => {
    if (!supabase || !userId) {
      setPlayer(null);
      return;
    }
    const { data } = await supabase
      .from('players')
      .select('id, email, name, preferred_name, status, default_available')
      .eq('auth_user_id', userId)
      .maybeSingle();
    setPlayer((data as Player | null) ?? null);
  }, []);

  useEffect(() => {
    void loadPlayer(session?.user.id);
  }, [session, loadPlayer]);

  const refreshPlayer = useCallback(
    () => loadPlayer(session?.user.id),
    [loadPlayer, session]
  );

  return { loading, session, player, refreshPlayer };
}
