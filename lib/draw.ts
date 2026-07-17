// The Runt — the draw.
//
// Randomizes the "In" players for a week into groups of 4 (dropping to 3 or 2
// as numbers require), keeping each guest in their host's group and padding
// short groups to a full 4-ball with blockers (non-playing members). The
// randomization runs here; apply_draw() persists it atomically.

import { supabase } from './supabase';

export type DraftGroup = {
  memberIds: string[];
  blockerIds: string[];
  guestIds: string[];
};

type Unit = { memberIds: string[]; guestIds: string[]; size: number };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function computeGroups(
  inIds: string[],
  guestsByHost: Record<string, string[]>,
  blockerPool: string[],
  matches: [string, string][] = []
): DraftGroup[] {
  // Cluster players that must stay together (matches) with union-find.
  const inSet = new Set(inIds);
  const parent: Record<string, string> = {};
  inIds.forEach((id) => (parent[id] = id));
  const find = (x: string): string => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const [a, b] of matches) {
    if (inSet.has(a) && inSet.has(b)) union(a, b);
  }
  const clusters: Record<string, string[]> = {};
  inIds.forEach((id) => (clusters[find(id)] ??= []).push(id));

  // Each cluster (matched players + all their guests) is one unit that stays together.
  let units: Unit[] = Object.values(clusters).map((members) => {
    const guestIds = members.flatMap((m) => guestsByHost[m] ?? []);
    return { memberIds: members, guestIds, size: members.length + guestIds.length };
  });
  // Shuffle for randomness, then place larger units first (first-fit decreasing).
  units = shuffle(units).sort((a, b) => b.size - a.size);

  const groups: { units: Unit[]; used: number }[] = [];
  for (const u of units) {
    // Best-fit: the fullest group that still has room for this unit.
    let best: { units: Unit[]; used: number } | null = null;
    for (const g of groups) {
      if (g.used + u.size <= 4 && (!best || g.used > best.used)) best = g;
    }
    if (best) {
      best.units.push(u);
      best.used += u.size;
    } else {
      groups.push({ units: [u], used: u.size });
    }
  }

  // Avoid lonely groups of 1: borrow a single from a full group → 3 and 2.
  for (const g of groups) {
    if (g.used === 1) {
      const donor = groups.find(
        (d) => d !== g && d.used >= 4 && d.units.some((u) => u.size === 1)
      );
      if (donor) {
        const idx = donor.units.findIndex((u) => u.size === 1);
        const [u] = donor.units.splice(idx, 1);
        donor.used -= 1;
        g.units.push(u);
        g.used += 1;
      }
    }
  }

  // Pad each short group to 4 with blockers.
  const pool = shuffle(blockerPool);
  let bi = 0;
  return groups.map((g) => {
    const blockerIds: string[] = [];
    const need = 4 - g.used;
    for (let k = 0; k < need && bi < pool.length; k++) blockerIds.push(pool[bi++]);
    return {
      memberIds: g.units.flatMap((u) => u.memberIds),
      guestIds: g.units.flatMap((u) => u.guestIds),
      blockerIds,
    };
  });
}

export async function runDraw(weekId: string): Promise<void> {
  if (!supabase) throw new Error('No connection.');

  const { data: av, error: e1 } = await supabase
    .from('availability')
    .select('player_id')
    .eq('week_id', weekId)
    .eq('is_available', true);
  if (e1) throw e1;
  const inIds = (av ?? []).map((r: { player_id: string }) => r.player_id);
  if (inIds.length === 0) throw new Error('No one is In for this week yet.');

  const { data: gs, error: e2 } = await supabase
    .from('guests')
    .select('id, host_player_id')
    .eq('week_id', weekId);
  if (e2) throw e2;
  const guestsByHost: Record<string, string[]> = {};
  (gs ?? []).forEach((g: { id: string; host_player_id: string }) => {
    (guestsByHost[g.host_player_id] ??= []).push(g.id);
  });

  const { data: ap, error: e3 } = await supabase
    .from('players')
    .select('id')
    .eq('status', 'active');
  if (e3) throw e3;
  const inSet = new Set(inIds);
  const blockerPool = (ap ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id: string) => !inSet.has(id));

  const { data: mt, error: e5 } = await supabase
    .from('matches')
    .select('player_a, player_b')
    .eq('week_id', weekId);
  if (e5) throw e5;
  const matches = (mt ?? []).map(
    (m: { player_a: string; player_b: string }) => [m.player_a, m.player_b] as [string, string]
  );

  const plan = computeGroups(inIds, guestsByHost, blockerPool, matches);

  const { error: e4 } = await supabase.rpc('apply_draw', {
    p_week_id: weekId,
    p_groups: plan,
  });
  if (e4) throw e4;

  await supabase.from('weeks').update({ status: 'draw_complete' }).eq('id', weekId);
}

export async function resetDraw(weekId: string): Promise<void> {
  if (!supabase) throw new Error('No connection.');
  const { error } = await supabase.rpc('reset_draw', { p_week_id: weekId });
  if (error) throw error;
}
