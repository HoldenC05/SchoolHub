import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { isTauri } from "../lib/api";
import { Button, Card, Field, SelectInput, TextInput } from "../components/ui";

interface TailscaleInfo {
  ip: string;
  hostname: string;
}

interface CalStatus {
  email: string;
  connected: boolean;
  calendar_name: string;
  calendar_href: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

interface CalListResult {
  calendars: { href: string; name: string | null }[];
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
      className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function CalendarSection() {
  const [status, setStatus] = useState<CalStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<{ href: string; name: string | null }[] | null>(null);
  const [selectedHref, setSelectedHref] = useState("");
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

  const connect = async () => {
    setBusy(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await invoke<CalListResult>("cal_connect", { email, password });
      setCalendars(res.calendars);
      if (res.calendars.length > 0) {
        setSelectedHref(res.calendars[0].href);
      }
      refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const selectCalendar = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = calendars?.find((c) => c.href === selectedHref);
      await invoke("cal_select", { href: selectedHref, name: picked?.name ?? null });
      setCalendars(null);
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
      setStatus({ email: "", connected: false, calendar_name: "", calendar_href: "", last_sync_at: null, last_sync_error: null });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isTauri()) {
    return (
      <Card className="flex items-start gap-3">
        <span className="text-2xl">🍎</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-100">Apple Calendar (iCloud)</p>
          <p className="text-sm text-slate-500">
            Connected through your Mac. Events synced from iCloud appear in Today and Planner.
          </p>
        </div>
      </Card>
    );
  }

  if (status?.connected) {
    return (
      <Card className="flex items-start gap-3">
        <span className="text-2xl">🍎</span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-slate-100">Apple Calendar (iCloud)</p>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
              Connected
            </span>
          </div>
          <p className="text-sm text-slate-400">
            {status.email} →{" "}
            <span className="text-slate-200">{status.calendar_name || status.calendar_href}</span>
          </p>
          {status.last_sync_at && (
            <p className="text-xs text-slate-500">Last synced {status.last_sync_at}</p>
          )}
          {status.last_sync_error && (
            <p className="text-xs text-rose-400">Last sync failed: {status.last_sync_error}</p>
          )}
          {syncResult && (
            <p className="text-xs text-slate-400">
              Sync complete — {syncResult.pushed} pushed, {syncResult.pulled} pulled
              {syncResult.events_removed > 0 ? `, ${syncResult.events_removed} removed` : ""}.
              {syncResult.error ? ` Error: ${syncResult.error}` : ""}
            </p>
          )}
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={syncNow} disabled={busy} className="disabled:opacity-50">
              {busy ? "Syncing…" : "Sync now"}
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
          <p className="font-medium text-slate-100">Apple Calendar (iCloud)</p>
          <p className="text-sm text-slate-500">
            Two-way sync via CalDAV. Pushes your assignments with reminders, pulls your calendar into
            Today and Planner. Use an app-specific password from{" "}
            <a
              className="text-indigo-300 underline"
              href="https://appleid.apple.com"
              target="_blank"
              rel="noreferrer"
            >
              appleid.apple.com
            </a>
            .
          </p>
        </div>

        {calendars === null ? (
          <div className="flex flex-col gap-2">
            <Field label="Apple ID email">
              <TextInput value={email} onChange={setEmail} placeholder="you@icloud.com" />
            </Field>
            <Field label="App-specific password">
              <TextInput value={password} onChange={setPassword} placeholder="xxxx-xxxx-xxxx-xxxx" />
            </Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div>
              <Button onClick={connect} disabled={busy || !email || !password} className="disabled:opacity-50">
                {busy ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {calendars.length === 0 ? (
              <p className="text-sm text-rose-400">
                No calendars found on this account. Create one at icloud.com/calendar, then try again.
              </p>
            ) : (
              <>
                <Field label="Choose a calendar to sync with">
                  <SelectInput
                    value={selectedHref}
                    onChange={setSelectedHref}
                    options={calendars.map((c) => ({
                      value: c.href,
                      label: c.name || c.href,
                    }))}
                  />
                </Field>
                <div>
                  <Button onClick={selectCalendar} disabled={busy || !selectedHref} className="disabled:opacity-50">
                    {busy ? "Saving…" : "Use this calendar"}
                  </Button>
                  <button
                    className="ml-3 text-sm text-slate-400 underline"
                    onClick={() => setCalendars(null)}
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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
        <h1 className="text-2xl font-bold text-slate-100">Integrations</h1>
        <p className="text-sm text-slate-400">Connect School Hub to your world</p>
      </header>

      {isTauri() && (
        <Card className="border-emerald-500/30">
          <h2 className="mb-1 font-semibold text-slate-100">Pair your phone</h2>
          <p className="mb-4 text-sm text-slate-400">
            Open your iPhone camera and point it at the QR code — it takes you straight to School
            Hub and connects automatically.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-xl bg-white p-2 shadow-lg">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Pairing QR code" className="h-52 w-52" />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center text-sm text-slate-400">
                  Preparing…
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-400">Phone URL</p>
                {phoneUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 text-sm text-emerald-300">
                      {phoneUrl}
                    </code>
                    <CopyButton text={phoneUrl} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{tailError || "Reading…"}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-400">
                  Or manually — pairing token
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 text-sm text-indigo-300">
                    {token || "Reading…"}
                  </code>
                  {token && <CopyButton text={token} />}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Server runs on <code className="text-slate-300">http://127.0.0.1:8787</code> — it
            listens on all interfaces so your phone can reach it over Tailscale. Your Mac must be on
            and awake.
          </p>
        </Card>
      )}

      {!isTauri() && (
        <Card>
          <h2 className="font-semibold text-slate-100">You're connected</h2>
          <p className="text-sm text-slate-400">
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
                  <p className="font-medium text-slate-100">{i.name}</p>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
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
