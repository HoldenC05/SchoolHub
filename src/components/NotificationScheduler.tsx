import { useEffect } from "react";
import { useData } from "../lib/useData";
import { notify, requestNotificationPermission } from "../lib/notifications";
import type { AppSettings, Assignment, Meeting } from "../lib/types";

const FIRED_KEY = "schoolhub-notified-v1";

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveFired(fired: Set<string>) {
  if (fired.size > 400) {
    const arr = [...fired];
    fired = new Set(arr.slice(arr.length - 200));
  }
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...fired]));
  } catch {
    /* ignore */
  }
}

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationScheduler() {
  const { data: assignments } = useData<Assignment[]>("/api/assignments");
  const { data: meetings } = useData<Meeting[]>("/api/meetings");
  const { data: settings } = useData<AppSettings[]>("/api/settings");
  const row = settings?.[0];
  const enabled = row?.notifications_enabled === 1;
  const lead = row?.notify_before_minutes ?? 60;

  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const now = Date.now();
      const windowMs = lead * 60_000;
      const fired = loadFired();
      const fire = (key: string, title: string, body: string) => {
        if (fired.has(key)) return;
        fired.add(key);
        void notify(title, body);
      };
      for (const a of assignments || []) {
        if (!a.due_at) continue;
        if (a.status === "done" || a.status === "graded") continue;
        const due = new Date(a.due_at).getTime();
        if (isNaN(due) || due < now || due > now + windowMs) continue;
        fire(`a:${a.id}:${a.due_at}`, `${a.title} is due`, `Due ${fmtWhen(due)}`);
      }
      for (const m of meetings || []) {
        if (!m.starts_at) continue;
        const s = new Date(m.starts_at).getTime();
        if (isNaN(s) || s < now || s > now + windowMs) continue;
        fire(`m:${m.id}:${m.starts_at}`, `Meeting: ${m.title}`, `Starts ${fmtWhen(s)}`);
      }
      saveFired(fired);
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, lead, assignments, meetings]);

  return null;
}
