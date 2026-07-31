# School Hub

Your all-in-one school command center for macOS, with phone access.

## Features

- **Today** — agenda combining outstanding assignments and upcoming meetings
- **Planner** — a merged timeline of assignments, meetings, and project deadlines
- **Classes** — courses, teachers, terms (edit/delete included)
- **Homework & Tests** — filterable by type, click-to-cycle status, edit/delete
- **Activities** — per-activity tabs for clubs, teams, orgs, with Meetings, Projects, and Notes sub-tabs (all editable/deletable)
- **Ideas** — quick-capture inbox with done/delete
- **Notes** — Markdown notes, linkable to courses and activities
- **Phone access** — the app runs a local server; your phone connects over Tailscale
- **QR pairing** — scan a QR code from the Integrations tab to connect a new device instantly
- **Integrations** (planned) — Apple Calendar (CalDAV), Outlook (Microsoft Graph), Blackboard

## Architecture

- **Frontend:** React + TypeScript + Tailwind (Vite), shared between the desktop app and the phone PWA
- **Desktop shell:** Tauri v2 (Rust)
- **Storage:** SQLite on your Mac (`~/Library/Application Support/com.holden.schoolhub/`)
- **API:** axum HTTP server on port 8787 serving both the REST API and the PWA build
- **Pairing:** per-device bearer token, generated once and stored in the macOS Keychain

## Development

```sh
npm install
npm run tauri dev
```

The phone PWA needs the frontend built: `npm run build` (served from `dist/`).

## Phone setup

1. Install Tailscale on the Mac and phone (free), sign in to both.
2. Run School Hub on the Mac.
3. On the Mac, open **Integrations** in the sidebar and scan the QR code with your phone — it connects automatically. (Or open `http://<mac-tailscale-name>:8787` on the phone and paste the pairing token.)

## Milestone status

- [x] M1 — Scaffold: app shell, database, API, Tailscale phone access
- [x] M2 — Core hub polish (edit/delete everywhere, status toggles, QR pairing)
- [ ] M3 — Apple Calendar (CalDAV) two-way sync
- [ ] M4 — Outlook (Microsoft Graph) sync
- [ ] M5 — Blackboard connector
- [ ] M6 — Mobile PWA polish (quick-add, notifications)
