import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { isTauri } from "../lib/api";
import { Card } from "../components/ui";

interface TailscaleInfo {
  ip: string;
  hostname: string;
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

  const phoneUrl = tail
    ? `http://${tail.hostname || tail.ip}:8787`
    : null;

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
      icon: "🍎",
      name: "Apple Calendar (iCloud)",
      desc: "Two-way sync via CalDAV. Reads your events, pushes assignments with reminders.",
      status: "Planned",
    },
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
