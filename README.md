# School Hub

Your all-in-one school command center for macOS, with phone access.

## Features

- **Today** — agenda combining outstanding assignments, upcoming meetings, and synced calendar events
- **Planner** — a merged timeline of assignments, meetings, project deadlines, and calendar events
- **Classes** — courses, teachers, terms (edit/delete included)
- **Homework & Tests** — filterable by type, click-to-cycle status, edit/delete
- **Activities** — per-activity tabs for clubs, teams, orgs, with Meetings, Projects, and Notes sub-tabs (all editable/deletable)
- **Ideas** — quick-capture inbox with done/delete
- **Notes** — Markdown notes, linkable to courses and activities
- **Phone access** — the app runs a local server; your phone connects over Tailscale
- **QR pairing** — scan a QR code from the Integrations tab to connect a new device instantly
- **Apple Calendar (iCloud)** — two-way CalDAV sync: pushes assignments (with reminders), pulls your events into Today/Planner
- **Integrations** (planned) — Outlook (Microsoft Graph), Blackboard

## Architecture

- **Frontend:** React + TypeScript + Tailwind (Vite), shared between the desktop app and the phone PWA
- **Desktop shell:** Tauri v2 (Rust)
- **Storage:** SQLite on your Mac (`~/Library/Application Support/com.holden.schoolhub/`); Apple Calendar app-specific password is stored in the macOS Keychain
- **API:** axum HTTP server on port 8787 serving both the REST API and the PWA build
- **Pairing:** per-device bearer token, generated once and stored in the macOS Keychain
- **Calendar sync:** CalDAV against iCloud (`caldav.icloud.com`) — assignments push to your chosen calendar as events with a 12-hour reminder; remote events pull into the local `calendar_events` table for Today/Planner

**Phone access note:** the phone PWA talks to the server running on your Mac, so it needs the Mac to be on, awake, and on Tailscale. M7 (cloud sync) will decouple the phone from the Mac's state.

## Development

```sh
npm install
npm run tauri dev
```

The phone PWA needs the frontend built: `npm run build` (served from `dist/`).

## Milestone verification

Run this after every milestone to make sure nothing broke:

```sh
npm run verify
```

It checks, in order:

1. **TypeScript typecheck** — `tsc --noEmit`
2. **Frontend build** — Vite production build
3. **Rust tests** — `cargo test`: unit tests for the ICS parser/builder, date helpers, DB migrations & CRUD, and axum API integration tests (auth, CRUD cycle, malformed input)
4. **Live API smoke test** — against the running server on port 8787: health, 401 without a token, every resource listable, and a create → delete round-trip

For step 4 the server must be running (`npm run tauri dev`); if it isn't, the script prints a note and skips that step.

## Phone setup

1. Install Tailscale on the Mac and phone (free), sign in to both.
2. Run School Hub on the Mac.
3. On the Mac, open **Integrations** in the sidebar and scan the QR code with your phone — it connects automatically. (Or open `http://<mac-tailscale-name>:8787` on the phone and paste the pairing token.)

## Milestone status

- [x] M1 — Scaffold: app shell, database, API, Tailscale phone access
- [x] M2 — Core hub polish (edit/delete everywhere, status toggles, QR pairing)
- [x] M3 — Apple Calendar (CalDAV) two-way sync
- [ ] M4 — Outlook (Microsoft Graph) sync
- [ ] M5 — Blackboard connector
- [ ] M6 — Mobile PWA polish (quick-add, notifications)
- [ ] M7 — Cloud sync (Supabase): phone works even when your Mac is closed
