# App Store submission pack — The Runt

Everything needed to submit to the App Store, drafted for you to paste into
App Store Connect. Items marked **(you)** need an action only you can do.

---

## 1. App information

| Field | Value |
|---|---|
| **App name** (≤30) | The Runt |
| **Subtitle** (≤30) | Saturday golf, sorted |
| **Bundle ID** | com.joycedesign.therunt |
| **Primary category** | Sports |
| **Secondary category** | Lifestyle |
| **Age rating** | 4+ (no objectionable content) |
| **Price** | Free |

**Keywords** (≤100 chars, comma-separated, no spaces):
```
golf,society,teetime,fourball,group,availability,saturday,rota,club,organiser
```

**Promotional text** (≤170, editable anytime):
```
Nominate your Saturdays, get drawn into balanced groups, and let the week's
organiser book the tee times — all in one place.
```

**Description:**
```
The Runt is a simple organiser for a golf group's weekly Saturday game.

• Nominate which Saturdays you're playing.
• Bring a guest — they're kept in your group.
• The app draws everyone into balanced groups of four (dropping to three or
  two when numbers require), keeping playing partners and cart-sharers
  together.
• The week's organiser reviews the draw and books the tee times.
• A reserve list handles anyone who joins after the draw.
• One-off golf days and social events, too.

Sign in with your club membership number. Face ID keeps it locked to you.

The Runt is built for a private golf group — you'll need to be added by your
organiser to take part.
```

**Support URL** (you — a page you control): e.g. https://joycedesign.com.au
**Marketing URL** (optional): leave blank or your site.
**Privacy Policy URL** (you — must be public; text in §4 below to host).

---

## 2. App Review information **(you)**

The app is behind a login with **no public sign-up** (members are pre-added by
the organiser). Apple's reviewer must be able to get in, so:

- **Sign-In required: YES.**
- Provide a **demo account**: create a throwaway member row + password and put
  its **membership number** as the username and the **password** in the
  "App Review Information → Sign-In" fields.
- **Review notes** (paste):
  ```
  This is a private organiser app for a single ~20-person golf group. There is
  no public sign-up: members are pre-added by the organiser and sign in with a
  club membership number + password (demo credentials provided above). Face ID
  is an optional local app-lock. "Guests" are names a member adds for a given
  week. Account deletion is available in Profile → Delete account.
  ```

---

## 3. App Privacy ("nutrition labels") answers

No analytics, ads, or tracking SDKs. Backend is Supabase (database/auth); push
uses Expo's push service. **Data used to track you: None.**

Data collected, **linked to the user**, used only for **App Functionality**:

| Type | Specifically | Why |
|---|---|---|
| Contact Info → **Name** | name / preferred name | show who's playing |
| Contact Info → **Email Address** | account + email invites | auth / invites |
| Identifiers → **User ID** | club membership number | identify the member |
| Identifiers → **Device ID** | Expo push token | send notifications |
| User Content → **Other** | availability, guest names, tee times | run the roster/draw |

Not collected: location, financial info, health, contacts, photos, browsing
history, search history, purchases. **Face ID data never leaves the device**
(handled by iOS) — not collected.

Account deletion: **available in-app** (Profile → Delete account) — answer
"Yes" to the account-deletion question.

---

## 4. Privacy policy (host this at a public URL) **(you)**

```
Privacy Policy — The Runt

The Runt is a private organiser app for a golf group. This policy explains what
we collect and why.

What we collect
- Your name / preferred name, and club membership number, so the group can see
  who's playing and identify you.
- An email address, used to sign in and to send member invites.
- Names you enter for guests you bring.
- Your weekly availability and the tee-time details for your group.
- A device push token, so we can send you notifications (only if you allow
  notifications).

We do not collect your location, and we do not use analytics, advertising, or
any third-party tracking. Face ID / biometric data is handled entirely by your
device and is never sent to us.

How it's used
Only to run the group's roster, draws, bookings, and notifications. We never
sell your data or use it for advertising.

Where it's stored
In a secured cloud database (Supabase). Push notifications are delivered via
Expo's push service.

Deleting your data
You can permanently delete your account and all associated data at any time in
the app: Profile → Delete account. You may also ask the organiser to remove you.

Children
The app is not directed at children under 13.

Contact
Questions: henry@joycedesign.com.au
```

---

## 5. Screenshots **(you)**

Apple requires screenshots for at least one 6.5"/6.9" iPhone size. Capture from
the TestFlight build (or the simulator) — good candidates:
1. The Availability list (Saturdays + the organiser card).
2. A completed draw (groups with names).
3. A booked week (two-column groups with tee times).
4. The Admin → Events or Notification schedule screen.

---

## 6. Build & submit (recap)

```
eas build --platform ios --profile production   # let EAS manage credentials + APNs key
eas submit --platform ios --profile production  # uploads to App Store Connect → TestFlight
```
Then test via TestFlight, fill the fields above, and submit for review.
JS-only fixes after a build: `npm run deploy:prod`.
```
