import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { isTauri } from "../lib/api";
import { Button, Card, Field, TextInput } from "../components/ui";

interface TailscaleInfo {
  ip: string;
  hostname: string;
}

interface CalSel {
  href: string;
  name: string;
}

interface CalStatus {
  email: string;
  connected: boolean;
  calendars: CalSel[];
  push_calendar: CalSel | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

interface CalListResult {
  calendars: CalSel[];
}

interface CalSyncResult {
  pushed: number;
  pulled: number;
  events_removed: number;
  error: string | null;
  last_sync_at: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function CalendarPicker({
  list,
  checked,
  pushHref,
  busy,
  onToggle,
  onTogglePush,
  onSave,
  onCancel,
}: {
  list: CalSel[];
  checked: Set<string>;
  pushHref: string | null;
  busy: boolean;
  onToggle: (href: string) => void;
  onTogglePush: (href: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {list.map((c) => (
          <label
            key={c.href}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
              checked.has(c.href)
                ? "border-indigo-300 bg-indigo-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-500"
              checked={checked.has(c.href)}
              onChange={() => onToggle(c.href)}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-900">
              {c.name || c.href}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="radio"
                name="push-target"
                className="h-4 w-4 accent-emerald-500"
                checked={pushHref === c.href}
                disabled={!checked.has(c.href)}
                onChange={() => onTogglePush(c.href)}
              />
              push assignments
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={busy || checked.size === 0} className="disabled:opacity-50">
          {busy ? "Saving…" : "Use selected calendars"}
        </Button>
        <button className="text-sm text-slate-500 underline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CalendarSection() {
  const [status, setStatus] = useState<CalStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<CalSel[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pushHref, setPushHref] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<CalSyncResult | null>(null);

  const refreshStatus = () => {
    if (!isTauri()) return;
    invoke<CalStatus>("cal_sync_status")
      .then(setStatus)
      .catch((e) => console.error("cal status failed", e));
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const beginPicker = (calendars: CalSel[]) => {
    setList(calendars);
    setChecked(new Set(calendars.map((c) => c.href)));
    setPushHref(status?.push_calendar?.href ?? calendars[0]?.href ?? null);
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await invoke<CalListResult>("cal_connect", { email, password });
      beginPicker(res.calendars);
      refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const changeCalendars = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await invoke<CalListResult>("cal_list");
      beginPicker(res.calendars);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSelection = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = (list || [])
        .filter((c) => checked.has(c.href))
        .map((c) => ({ href: c.href, name: c.name, push: c.href === pushHref }));
      await invoke("cal_select", { calendars: payload });
      setList(null);
      refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await invoke<CalSyncResult>("cal_sync_now");
      setSyncResult(res);
      refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("cal_disconnect");
      setStatus({
        email: "",
        connected: false,
        calendars: [],
        push_calendar: null,
        last_sync_at: null,
        last_sync_error: null,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (href: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
        setPushHref((p) => (p === href ? null : p));
      } else {
        next.add(href);
        setPushHref((p) => p ?? href);
      }
      return next;
    });
  };

  const togglePush = (href: string) => setPushHref(href);

  if (!isTauri()) {
    return (
      <Card className="flex items-start gap-3">
        <span className="text-2xl">🍎</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">Apple Calendar (iCloud)</p>
          <p className="text-sm text-slate-500">
            Connected through your Mac. Events synced from iCloud appear in Today and Planner.
          </p>
        </div>
      </Card>
    );
  }

  if (list !== null) {
    return (
      <Card className="flex items-start gap-3">
        <span className="text-2xl">🍎</span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium text-slate-900">Apple Calendar (iCloud)</p>
            <p className="text-sm text-slate-500">
              Check the calendars to pull events from, then mark which one should receive your
              assignments (push).
            </p>
          </div>
          <CalendarPicker
            list={list}
            checked={checked}
            pushHref={pushHref}
            busy={busy}
            onToggle={toggle}
            onTogglePush={togglePush}
            onSave={saveSelection}
            onCancel={() => {
              setList(null);
              setError(null);
            }}
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      </Card>
    );
  }

  if (status?.connected && (status.calendars.length > 0 || status.push_calendar)) {
    const names = status.calendars.map((c) => c.name || c.href);
    return (
      <Card className="flex items-start gap-3">
        <span className="text-2xl">🍎</span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-slate-900">Apple Calendar (iCloud)</p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">
              Connected
            </span>
          </div>
          <p className="text-sm text-slate-500">{status.email}</p>
          <p className="text-xs text-slate-500">
            Pulling from{" "}
            <span className="text-slate-700">{names.length} calendar{names.length === 1 ? "" : "s"}</span>
            {names.length > 0 && <span className="text-slate-500"> — {names.join(", ")}</span>}
          </p>
          {status.push_calendar && (
            <p className="text-xs text-slate-500">
              Assignments push to{" "}
              <span className="text-slate-700">{status.push_calendar.name || status.push_calendar.href}</span>
            </p>
          )}
          {!status.push_calendar && (
            <p className="text-xs text-amber-600">No push target — assignments aren't sent to iCloud.</p>
          )}
          {status.last_sync_at && (
            <p className="text-xs text-slate-500">Last synced {status.last_sync_at}</p>
          )}
          {status.last_sync_error && (
            <p className="text-xs text-rose-600">Last sync failed: {status.last_sync_error}</p>
          )}
          {syncResult && (
            <p className="text-xs text-slate-500">
              Sync complete — {syncResult.pushed} pushed, {syncResult.pulled} pulled
              {syncResult.events_removed > 0 ? `, ${syncResult.events_removed} removed` : ""}.
              {syncResult.error ? ` Error: ${syncResult.error}` : ""}
            </p>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={syncNow} disabled={busy} className="disabled:opacity-50">
              {busy ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="ghost" onClick={changeCalendars} disabled={busy} className="disabled:opacity-50">
              Change calendars
            </Button>
            <Button variant="danger" onClick={disconnect} disabled={busy} className="disabled:opacity-50">
              Disconnect
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-start gap-3">
      <span className="text-2xl">🍎</span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="font-medium text-slate-900">Apple Calendar (iCloud)</p>
          <p className="text-sm text-slate-500">
            Pull events from as many calendars as you like, and pick one to push assignments into.
            Use an app-specific password from{" "}
            <a
              className="text-indigo-600 underline"
              href="https://appleid.apple.com"
              target="_blank"
              rel="noreferrer"
            >
              appleid.apple.com
            </a>
            .
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Field label="Apple ID email">
            <TextInput value={email} onChange={setEmail} placeholder="you@icloud.com" />
          </Field>
          <Field label="App-specific password">
            <TextInput value={password} onChange={setPassword} placeholder="xxxx-xxxx-xxxx-xxxx" />
          </Field>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div>
            <Button onClick={connect} disabled={busy || !email || !password} className="disabled:opacity-50">
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function IntegrationsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tail, setTail] = useState<TailscaleInfo | null>(null);
  const [tailError, setTailError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<string>("get_pairing_token")
      .then(setToken)
      .catch((e) => console.error("failed to get token", e));
    invoke<TailscaleInfo>("tailscale_info")
      .then(setTail)
      .catch((e) => setTailError(String(e)));
  }, []);

  const phoneUrl = tail ? `http://${tail.hostname || tail.ip}:8787` : null;

  useEffect(() => {
    if (!phoneUrl || !token) return;
    QRCode.toDataURL(`${phoneUrl}/#pair=${token}`, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch((e) => console.error("qr failed", e));
  }, [phoneUrl, token]);

  const integrations = [
    {
      icon: "📧",
      name: "Outlook / Microsoft",
      desc: "Two-way calendar sync through the Microsoft Graph API.",
      status: "Planned",
    },
    {
      icon: "🎓",
      name: "Blackboard",
      desc: "Best-effort auto-sync of assignments and grades. May break if Blackboard changes.",
      status: "Planned",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="text-sm text-slate-500">Connect School Hub to your world</p>
      </header>

      {isTauri() && (
        <Card className="border-emerald-500/30">
          <h2 className="mb-1 font-semibold text-slate-900">Pair your phone</h2>
          <p className="mb-4 text-sm text-slate-500">
            Open your iPhone camera and point it at the QR code — it takes you straight to School
            Hub and connects automatically.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-xl bg-white p-2 shadow-lg">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Pairing QR code" className="h-52 w-52" />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center text-sm text-slate-500">
                  Preparing…
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Phone URL</p>
                {phoneUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-emerald-600">
                      {phoneUrl}
                    </code>
                    <CopyButton text={phoneUrl} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{tailError || "Reading…"}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Or manually — pairing token
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-indigo-600">
                    {token || "Reading…"}
                  </code>
                  {token && <CopyButton text={token} />}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Server runs on <code className="text-slate-600">http://127.0.0.1:8787</code> — it
            listens on all interfaces so your phone can reach it over Tailscale. Your Mac must be on
            and awake.
          </p>
        </Card>
      )}

      {!isTauri() && (
        <Card>
          <h2 className="font-semibold text-slate-900">You're connected</h2>
          <p className="text-sm text-slate-500">
            This device is paired to your Mac's School Hub. Data is read and written through the
            app running on your Mac.
          </p>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Connected services
        </h2>
        <div className="space-y-2">
          <CalendarSection />
          {integrations.map((i) => (
            <Card key={i.name} className="flex items-start gap-3">
              <span className="text-2xl">{i.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{i.name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {i.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{i.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
