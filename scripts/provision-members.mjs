// One-time member provisioning for The Runt.
//
// Creates a password account for each member: email = <number>@therunt.app,
// password = last name (lowercase, spaces removed), then links it to the
// member's profile via the claim_or_create_member() function. Uses only the
// public anon key — no service_role needed.
//
// Run:  set -a; . ./.env; set +a; node scripts/provision-members.mjs
// Safe to re-run (existing accounts are signed into, not recreated).
//
// Prereqs: member rows exist with these membership_number values (availability
// import SQL), and Henry's old email account has been removed so 4053 can link.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DOMAIN = 'therunt.app';

// [membership number, last name]
const members = [
  ['4053', 'Joyce'],
  ['2457', 'Jordan'],
  ['5152', 'Jordan'],
  ['6312', 'Menzel'],
  ['6334', 'Vaittinen'],
  ['6321', 'Hall'],
  ['2755', 'Mater'],
  ['751', 'King'],
  ['3025', 'Tweedale'],
  ['6359', 'Trott'],
  ['3026', 'Bryant'],
  ['6221', 'Fulcher'],
  ['6305', 'Barnes'],
  ['3047', 'Bernhardt'],
  ['2383', 'Wright'],
  ['2768', 'Dunn'],
  ['5038', 'Taylor'],
  ['2770', 'Coyne'],
  ['6336', 'Du Preez'],
  ['4048', 'Walker'],
];

const pw = (last) => last.toLowerCase().replace(/\s+/g, '');

if (!URL || !KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

let ok = 0;
for (const [num, last] of members) {
  const supa = createClient(URL, KEY, { auth: { persistSession: false } });
  const email = `${num}@${DOMAIN}`;
  const password = pw(last);

  // Create the account (or fall back to signing in if it already exists).
  let session = null;
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error && !/already registered/i.test(error.message)) {
    console.log(`❌ ${num} signup: ${error.message}`);
    continue;
  }
  session = data?.session ?? null;
  if (!session) {
    const { data: d2, error: e2 } = await supa.auth.signInWithPassword({ email, password });
    if (e2) {
      console.log(`❌ ${num} signin: ${e2.message}`);
      continue;
    }
    session = d2.session;
  }

  // Link this account to the member's profile by membership number.
  const { error: e3 } = await supa.rpc('claim_or_create_member', { p_number: num });
  if (e3) console.log(`⚠️  ${num} (${last}) claim: ${e3.message}`);
  else {
    console.log(`✅ ${num} (${last}) — login ${num} / ${password}`);
    ok++;
  }
  await supa.auth.signOut();
}
console.log(`\nDone: ${ok}/${members.length} provisioned.`);
