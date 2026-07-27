// The Runt — append an entry to a week's change log.
//
// Best-effort: logging must never block or fail the action it records, so
// errors are swallowed (the log is a convenience, not a source of truth).

import { supabase } from './supabase';
import type { Player } from './useAuth';

export async function logChange(
  weekId: string,
  action: string,
  author: Player | null
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('change_log').insert({
      week_id: weekId,
      action,
      author_player_id: author?.id ?? null,
      author_name: author?.preferred_name || author?.name || 'someone',
    });
  } catch {
    // ignore — a failed log entry shouldn't surface to the user
  }
}
