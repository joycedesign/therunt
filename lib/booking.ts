// The Runt — manual booking.
//
// The Runt sets each group's confirmed tee time and marks it booked. When all
// of a week's groups are booked, the week rolls up to 'booked'.

import { supabase } from './supabase';

async function refreshWeekStatus(weekId: string): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase
    .from('groups')
    .select('booking_status')
    .eq('week_id', weekId);
  const groups = (data ?? []) as { booking_status: string }[];
  const allBooked =
    groups.length > 0 && groups.every((g) => g.booking_status === 'confirmed');
  await supabase
    .from('weeks')
    .update({ status: allBooked ? 'booked' : 'draw_complete' })
    .eq('id', weekId);
}

export async function bookGroup(
  groupId: string,
  weekId: string,
  teeTimeISO: string
): Promise<void> {
  if (!supabase) throw new Error('No connection.');
  const { error } = await supabase
    .from('groups')
    .update({ tee_time: teeTimeISO, booking_status: 'confirmed' })
    .eq('id', groupId);
  if (error) throw error;
  await refreshWeekStatus(weekId);
}

export async function unbookGroup(groupId: string, weekId: string): Promise<void> {
  if (!supabase) throw new Error('No connection.');
  const { error } = await supabase
    .from('groups')
    .update({ tee_time: null, booking_status: 'open' })
    .eq('id', groupId);
  if (error) throw error;
  await refreshWeekStatus(weekId);
}
