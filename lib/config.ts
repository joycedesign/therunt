// App-wide config.
//
// INVITE_URL is encoded in the Members → Invite QR code so a new person can
// scan it to join The Runt. Point it at the deployed web app once it's live.
export const INVITE_URL = 'https://therunt.expo.app';

// Members sign in with their Manly GC membership number. Supabase auth is
// email-based, so we map a number to a synthetic address <number>@<domain>.
// Nothing is ever emailed to these addresses.
export const AUTH_EMAIL_DOMAIN = 'therunt.app';

export function emailForMembership(num: string): string {
  return `${num.trim()}@${AUTH_EMAIL_DOMAIN}`;
}
