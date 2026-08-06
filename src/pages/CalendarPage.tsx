import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useData } from "../lib/useData";
import { api, isTauri } from "../lib/api";
import type { Assignment, CalendarEvent, Meeting } from "../lib/types";
import { Button, EmptyState, Field, Modal, SelectInput, TextInput } from "../components/ui";

type ViewMode = "month" | "week" | "day" | "agenda";
type ItemKind = "event" | "assignment" | "meeting";

interface CalSel {
  href: string;
  name: string;
  color: string | null;
}

interface CalStatus {
  email: string;
  connected: boolean;
  calendars: CalSel[];
  push_calendar: CalSel | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

interface CalItem {
  key: string;
  kind: ItemKind;
  id: number;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  color: string;
  calendarKey: string;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{8}$/.test(t)) return new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
  if (/^\d{12}$/.test(t))
    return new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12));
  if (/^\d{14}$/.test(t))
    return new Date(
      +t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8),
      +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14),
    );
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (iso)
    return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0));
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

function fmtTime(d: Date): string {
  if (d.getHours() === 0 && d.getMinutes() === 0) return "All day";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtRange(it: { allDay: boolean; start: Date; end: Date | null }): string {
  if (it.allDay) return "All day";
  if (it.end && !sameDay(it.start, it.end)) return fmtTime(it.start);
  if (it.end && it.end.getTime() > it.start.getTime()) return `${fmtTime(it.start)} – ${fmtTime(it.end)}`;
  return fmtTime(it.start);
}

function toDateInput(d: Date): string {
  return dayKey(d);
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toLocalInput(d: Date): string {
  return `${toDateInput(d)}T${toTimeInput(d)}`;
}

function isDateOnly(s: string | null): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function withAlpha(hex: string | null, alpha: string): string {
  const c = (hex || "#6366f1").trim();
  const core = /^#([0-9a-fA-F]{8})$/.test(c) ? c.slice(0, 7) : c;
  return `${core}${alpha}`;
}

function rruleFreq(rrule: string | null): string {
  if (!rrule) return "none";
  const m = /FREQ=(\w+)/.exec(rrule);
  return m ? m[1].toLowerCase() : "none";
}

const REPEAT_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function normalizeColor(c: string | null): string | null {
  if (!c) return null;
  const t = c.trim();
  const m8 = /^#([0-9a-fA-F]{8})$/.exec(t);
  if (m8) return `#${m8[1].slice(0, 6)}`;
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  return null;
}

const CAL_PALETTE = ["#4f46e5", "#0ea5e9", "#f97316", "#8b5cf6", "#10b981", "#ef4444", "#eab308", "#06b6d4", "#ec4899", "#84cc16"];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function autoColor(key: string): string {
  return CAL_PALETTE[hashStr(key) % CAL_PALETTE.length];
}

const HOUR_H = 48;
const DAY_H = 24 * HOUR_H;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function fmtMinutes(min: number): string {
  const m = Math.round(min) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hh}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function snapMinutes(min: number): number {
  const clamped = Math.max(0, Math.min(1440, min));
  return Math.round(clamped / 15) * 15;
}

function EventModal({
  state,
  onClose,
  onDone,
  calendars,
  defaultDate,
  defaultCalHref,
  defaultStart,
  defaultEnd,
}: {
  state: CalendarEvent | "new" | null;
  onClose: () => void;
  onDone: () => void;
  calendars: CalSel[];
  defaultDate: Date | null;
  defaultCalHref: string | null;
  defaultStart: Date | null;
  defaultEnd: Date | null;
}) {
  const editing = state && state !== "new" ? state : null;
  const isNew = state === "new";
  const open = state !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(() => {
    if (editing) {
      const start = parseDate(editing.starts_at);
      const end = parseDate(editing.ends_at);
      return {
        title: editing.summary ?? "",
        allDay: isDateOnly(editing.starts_at),
        startDate: start ? toDateInput(start) : "",
        startTime: start ? toTimeInput(start) : "",
        endDate: end ? toDateInput(end) : "",
        endTime: end ? toTimeInput(end) : "",
        location: editing.location ?? "",
        notes: editing.description ?? "",
        repeat: rruleFreq(editing.rrule),
      };
    }
    const start = defaultStart ?? defaultDate ?? new Date();
    const end = defaultEnd ?? new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + 1, start.getMinutes());
    return {
      title: "",
      allDay: false,
      startDate: toDateInput(start),
      startTime: toTimeInput(start),
      endDate: toDateInput(end),
      endTime: toTimeInput(end),
      location: "",
      notes: "",
      repeat: "none",
    };
  }, [editing, defaultDate, defaultStart, defaultEnd]);

  const [title, setTitle] = useState("");
  const [calHref, setCalHref] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [originalRrule, setOriginalRrule] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initial.title);
    setAllDay(initial.allDay);
    setStartDate(initial.startDate);
    setStartTime(initial.startTime);
    setEndDate(initial.endDate);
    setEndTime(initial.endTime);
    setLocation(initial.location);
    setNotes(initial.notes);
    setError(null);
    setBusy(false);
    if (editing) {
      setCalHref(editing.calendar_href ?? "");
      const rr = editing.rrule ?? null;
      setOriginalRrule(rr);
      const freq = rruleFreq(rr);
      const simple = REPEAT_OPTIONS.some((o) => {
        if (o.value === "none") return !rr;
        if (!rr) return false;
        const u = rr.toUpperCase().trim();
        return u === `FREQ=${o.value.toUpperCase()}` || u.startsWith(`FREQ=${o.value.toUpperCase()};`);
      });
      setRepeat(simple ? freq : "custom");
    } else {
      setCalHref(defaultCalHref ?? calendars.find((c) => c.href)?.href ?? "");
      setOriginalRrule(null);
      setRepeat("none");
    }
  }, [open, editing, initial, defaultCalHref, calendars]);

  const customRepeat = repeat === "custom";

  const save = async () => {
    if (!title.trim() || !startDate) return;
    setBusy(true);
    setError(null);
    const start = parseDate(allDay ? startDate : `${startDate}T${startTime || "09:00"}`);
    let end = parseDate(allDay ? endDate || startDate : `${endDate || startDate}T${endTime || startTime || "10:00"}`);
    if (!start || !end) {
      setError("Invalid date/time");
      setBusy(false);
      return;
    }
    if (end.getTime() <= start.getTime()) {
      end = allDay ? addDays(start, 1) : new Date(start.getTime() + 60 * 60 * 1000);
    }
    const startStr = allDay ? toDateInput(start) : toLocalInput(start);
    const endStr = allDay ? toDateInput(end) : toLocalInput(end);
    const exdates = editing?.exdates || null;
    let rrule: string | null = null;
    if (repeat === "none") rrule = null;
    else if (repeat === "custom") rrule = originalRrule;
    else rrule = `FREQ=${repeat.toUpperCase()}`;

    try {
      if (isNew) {
        await invoke<CalendarEvent>("cal_event_create", {
          calendarHref: calHref,
          title: title.trim(),
          startsAt: startStr,
          endsAt: endStr,
          allDay,
          location: location.trim() || null,
          notes: notes.trim() || null,
          rrule: rrule,
          exdates,
        });
      } else if (editing) {
        await invoke<CalendarEvent>("cal_event_update", {
          id: editing.id,
          title: title.trim(),
          startsAt: startStr,
          endsAt: endStr,
          allDay,
          location: location.trim() || null,
          notes: notes.trim() || null,
          rrule: rrule,
          exdates,
        });
      }
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("cal_event_delete", { id: editing.id });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isNew ? "New event" : "Edit event"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Study group" />
        </Field>
        {isNew && (
          <Field label="Calendar">
            <SelectInput
              value={calHref}
              onChange={setCalHref}
              options={calendars.map((c) => ({ value: c.href, label: c.name || c.href }))}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label={allDay ? "Date" : "Starts"}>
            <div className="flex flex-col gap-1.5">
              <input type="date" className={inputStyles} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              {!allDay && (
                <input type="time" className={inputStyles} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              )}
            </div>
          </Field>
          <Field label={allDay ? "End date" : "Ends"}>
            <div className="flex flex-col gap-1.5">
              <input type="date" className={inputStyles} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {!allDay && (
                <input type="time" className={inputStyles} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              )}
            </div>
          </Field>
        </div>
        <Field label="Repeat">
          <SelectInput
            value={repeat}
            onChange={setRepeat}
            options={[...REPEAT_OPTIONS, { value: "custom", label: "Custom rule…" }]}
          />
        </Field>
        {customRepeat && (
          <p className="text-xs text-slate-500">This event has a custom repeat rule ({originalRrule}) — saved as-is.</p>
        )}
        <Field label="Location">
          <TextInput value={location} onChange={setLocation} placeholder="Optional" />
        </Field>
        <Field label="Notes">
          <textarea
            className={inputStyles + " min-h-20 resize-y"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {editing && (
            <button
              type="button"
              onClick={remove}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : isNew ? "Create event" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function AssignmentModal({
  state,
  onClose,
  onDone,
}: {
  state: Assignment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const open = state !== null;
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(state?.title ?? "");
    const d = parseDate(state?.due_at ?? null);
    setDueAt(d ? toLocalInput(d) : "");
    setNotes(state?.notes ?? "");
    setError(null);
    setBusy(false);
  }, [open, state]);

  const save = async () => {
    if (!state) return;
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.update<Assignment>(`/api/assignments/${state.id}`, {
        title: title.trim(),
        due_at: dueAt || null,
        notes: notes.trim() || null,
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit assignment">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} />
        </Field>
        <Field label="Due">
          <input type="datetime-local" className={inputStyles} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className={inputStyles + " min-h-20 resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function MeetingModal({
  state,
  onClose,
  onDone,
}: {
  state: Meeting | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const open = state !== null;
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [agenda, setAgenda] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(state?.title ?? "");
    const s = parseDate(state?.starts_at ?? null);
    const e = parseDate(state?.ends_at ?? null);
    setStartsAt(s ? toLocalInput(s) : "");
    setEndsAt(e ? toLocalInput(e) : "");
    setAgenda(state?.agenda ?? "");
    setNotes(state?.notes ?? "");
    setError(null);
    setBusy(false);
  }, [open, state]);

  const save = async () => {
    if (!state) return;
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.update<Meeting>(`/api/meetings/${state.id}`, {
        title: title.trim(),
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        agenda: agenda.trim() || null,
        notes: notes.trim() || null,
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      await api.remove(`/api/meetings/${state.id}`);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit meeting">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Title">
          <TextInput value={title} onChange={setTitle} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input type="datetime-local" className={inputStyles} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends">
            <input type="datetime-local" className={inputStyles} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Agenda">
          <textarea className={inputStyles + " min-h-16 resize-y"} value={agenda} onChange={(e) => setAgenda(e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className={inputStyles + " min-h-16 resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={remove}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

const inputStyles =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500";

function ItemChip({
  item,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  item: CalItem;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent, item: CalItem) => void;
  onDragEnd?: () => void;
}) {
  const draggable = onDragStart !== undefined;
  return (
    <button
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.stopPropagation();
        onDragStart(e, item);
      }}
      onDragEnd={(e) => {
        e.stopPropagation();
        onDragEnd?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight text-slate-700 transition-colors hover:brightness-125"
      style={{ background: withAlpha(item.color, "2e") }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} />
      <span className="truncate">{item.title}</span>
      {!item.allDay && <span className="ml-auto shrink-0 opacity-70">{fmtTime(item.start)}</span>}
    </button>
  );
}

function DayColumn({
  dayKey,
  items,
  isToday,
  drag,
  dragItem,
  onMouseDown,
  onItemClick,
  onItemDragStart,
  onItemDragEnd,
  onItemDrop,
}: {
  dayKey: string;
  items: CalItem[];
  isToday: boolean;
  drag: { startMin: number; curMin: number } | null;
  dragItem: CalItem | null;
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onItemClick: (it: CalItem) => void;
  onItemDragStart: (e: React.DragEvent, it: CalItem) => void;
  onItemDragEnd: () => void;
  onItemDrop: (it: CalItem, dayKey: string, startMin: number) => void;
}) {
  const allDay = items.filter((i) => i.allDay);
  const timed = useMemo(() => items.filter((i) => !i.allDay && dayKeyOf(i.start) === dayKey), [items, dayKey]);

  const layout = useMemo(() => {
    const effEnd = (it: CalItem) =>
      it.end && it.end.getTime() > it.start.getTime() ? it.end.getTime() : it.start.getTime() + 30 * 60000;
    const sorted = [...timed].sort((a, b) => a.start.getTime() - b.start.getTime() || effEnd(a) - effEnd(b));
    const clusters: CalItem[][] = [];
    let current: CalItem[] = [];
    let lastEnd: number | null = null;
    for (const it of sorted) {
      if (lastEnd !== null && it.start.getTime() >= lastEnd) {
        clusters.push(current);
        current = [];
        lastEnd = null;
      }
      current.push(it);
      const e = effEnd(it);
      if (lastEnd === null || e > lastEnd) lastEnd = e;
    }
    if (current.length) clusters.push(current);
    const placed: { it: CalItem; left: number; width: number }[] = [];
    const TITLE_MIN = 30;
    for (const cluster of clusters) {
      const lanes: CalItem[][] = [];
      for (const it of cluster) {
        const s = it.start.getTime();
        const sEnd = effEnd(it);
        let lane = -1;
        for (let i = 0; i < lanes.length; i++) {
          const conflict = lanes[i].some((other) => {
            const os = other.start.getTime();
            const oEnd = effEnd(other);
            if (s >= oEnd) return false;
            return s < os + TITLE_MIN * 60000 || sEnd > oEnd;
          });
          if (!conflict) {
            lane = i;
            break;
          }
        }
        if (lane === -1) lanes.push([it]);
        else lanes[lane].push(it);
      }
      const laneCount = Math.max(lanes.length, 1);
      lanes.forEach((lane, laneIdx) => {
        for (const it of lane) {
          placed.push({ it, left: laneIdx / laneCount, width: 1 / laneCount });
        }
      });
    }
    return { placed };
  }, [timed]);

  const now = new Date();
  const nowTop = isToday ? ((now.getHours() * 60 + now.getMinutes()) / 1440) * DAY_H : null;
  const dragRange = drag
    ? { start: Math.min(drag.startMin, drag.curMin), end: Math.max(drag.startMin, drag.curMin) }
    : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200 last:border-r-0">
      {allDay.length > 0 && (
        <div
          className="flex flex-col gap-0.5 border-b border-slate-200 px-1 py-1"
          onDragOver={(e) => {
            if (!dragItem) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            if (!dragItem) return;
            e.preventDefault();
            onItemDrop(dragItem, dayKey, 0);
          }}
        >
          {allDay.map((it) => (
            <ItemChip
              key={it.key}
              item={it}
              onClick={() => onItemClick(it)}
              onDragStart={dragItem ? undefined : onItemDragStart}
              onDragEnd={onItemDragEnd}
            />
          ))}
        </div>
      )}
      <div
        className={`relative cursor-crosshair select-none ${isToday ? "bg-indigo-50/60" : ""} ${
          dragItem ? "cursor-grabbing" : ""
        }`}
        style={{ height: DAY_H }}
        onMouseDown={onMouseDown}
        onDragOver={(e) => {
          if (!dragItem) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (!dragItem) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const min = snapMinutes(((e.clientY - rect.top) / rect.height) * 1440);
          onItemDrop(dragItem, dayKey, min);
        }}
      >
        {HOURS.map((h) => (
          <div key={h} className="absolute left-0 right-0 border-t border-slate-200" style={{ top: h * HOUR_H }} />
        ))}
        {nowTop != null && (
          <div className="absolute left-0 right-0 z-20 border-t-2 border-rose-500/80" style={{ top: nowTop }}>
            <span className="absolute -left-1 -top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500" />
          </div>
        )}
        {layout.placed.map(({ it, left, width }) => {
          const startMin = it.start.getHours() * 60 + it.start.getMinutes();
          let endMin = it.end ? it.end.getHours() * 60 + it.end.getMinutes() : startMin + 30;
          if (endMin <= startMin) endMin = 1440;
          let top = (startMin / 1440) * DAY_H;
          let hgt = Math.max(((endMin - startMin) / 1440) * DAY_H, 16);
          if (top + hgt > DAY_H) hgt = Math.max(DAY_H - top, 16);
          return (
            <button
              key={it.key}
              draggable={it.kind !== "assignment" && !dragItem}
              onDragStart={(e) => {
                if (it.kind === "assignment" || dragItem) return;
                e.stopPropagation();
                onItemDragStart(e, it);
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                onItemDragEnd();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(it);
              }}
              className="absolute flex flex-col items-start overflow-hidden rounded-md border-l-2 px-1 py-0.5 text-left leading-tight transition-colors hover:brightness-125"
              style={{
                top,
                height: hgt,
                left: `${left * 100}%`,
                width: `calc(${width * 100}% - 2px)`,
                background: withAlpha(it.color, "33"),
                borderColor: it.color,
              }}
            >
              <span
                className={`block text-[11px] font-semibold text-slate-900 ${
                  hgt >= 60 ? "break-words line-clamp-3" : hgt >= 40 ? "break-words line-clamp-2" : "truncate"
                }`}
              >
                {it.title}
              </span>
              {hgt >= 26 && (
                <span className="block truncate text-[10px] opacity-80">
                  {fmtClock(it.start)}
                  {it.end && it.end.getTime() > it.start.getTime() ? ` – ${fmtClock(it.end)}` : ""}
                </span>
              )}
            </button>
          );
        })}
        {dragRange && (
          <div
            className="pointer-events-none absolute left-0 z-10 rounded-md border border-indigo-400 bg-indigo-100 px-1"
            style={{
              top: (dragRange.start / 1440) * DAY_H,
              height: Math.max(((dragRange.end - dragRange.start) / 1440) * DAY_H, 8),
              width: "100%",
            }}
          >
            <span className="text-[10px] font-medium text-indigo-700">
              {fmtMinutes(dragRange.start)} – {fmtMinutes(dragRange.end)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function dayKeyOf(d: Date): string {
  return dayKey(d);
}

export function CalendarPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const assignments = useData<Assignment[]>("/api/assignments", reloadKey);
  const meetings = useData<Meeting[]>("/api/meetings", reloadKey);
  const events = useData<CalendarEvent[]>("/api/calendar_events", reloadKey);
  const [status, setStatus] = useState<CalStatus | null>(null);

  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [showAssignments, setShowAssignments] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [eventModal, setEventModal] = useState<CalendarEvent | "new" | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<Assignment | null>(null);
  const [meetingModal, setMeetingModal] = useState<Meeting | null>(null);
  const [newEventDefaults, setNewEventDefaults] = useState<{
    date: Date | null;
    cal: string | null;
    start: Date | null;
    end: Date | null;
  }>({ date: null, cal: null, start: null, end: null });
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const [drag, setDrag] = useState<{ dayKey: string; startMin: number; curMin: number } | null>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const [dragItem, setDragItem] = useState<CalItem | null>(null);
  const dragItemRef = useRef(dragItem);
  dragItemRef.current = dragItem;

  const tauri = isTauri();

  useEffect(() => {
    if (!tauri) return;
    invoke<CalStatus>("cal_sync_status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [reloadKey, tauri]);

  const refresh = () => setReloadKey((k) => k + 1);

  const syncNow = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await invoke("cal_sync_now");
      refresh();
    } catch {
      refresh();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  };

  const today = new Date();
  const todayKey = dayKey(today);
  const connected = !!status?.connected;
  const pushHref = status?.push_calendar?.href ?? null;

  useEffect(() => {
    if (!tauri || !connected) return;
    let disposed = false;
    const doSync = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        await invoke("cal_sync_now");
      } catch {
        // ignore background sync failures
      } finally {
        syncingRef.current = false;
      }
      if (!disposed) setReloadKey((k) => k + 1);
    };
    const t = window.setTimeout(() => doSync(), 800);
    const interval = window.setInterval(() => doSync(), 30 * 60 * 1000);
    return () => {
      disposed = true;
      window.clearTimeout(t);
      window.clearInterval(interval);
    };
  }, [tauri, connected]);

  const beginDrag = (dayKey: string, e: ReactMouseEvent<HTMLDivElement>) => {
    if (!tauri || !connected || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRectRef.current = rect;
    const min = snapMinutes(((e.clientY - rect.top) / rect.height) * 1440);
    setDrag({ dayKey, startMin: min, curMin: min });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      const r = dragRectRef.current;
      if (!r) return;
      const min = snapMinutes(((e.clientY - r.top) / r.height) * 1440);
      setDrag((d) => (d ? { ...d, curMin: min } : d));
    };
    const up = () => {
      const d = dragRef.current;
      dragRectRef.current = null;
      setDrag(null);
      if (!d) return;
      const startMin = Math.min(d.startMin, d.curMin);
      const endMin = Math.max(d.startMin, d.curMin);
      if (endMin - startMin < 15) return;
      const day = parseDate(d.dayKey);
      if (!day) return;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(startMin / 60), startMin % 60);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(endMin / 60), endMin % 60);
      setNewEventDefaults({ date: start, cal: pushHref, start, end });
      setEventModal("new");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, pushHref]);

  const handleItemDragStart = (e: React.DragEvent, it: CalItem) => {
    if (it.kind === "event" && !tauri) return;
    setDragItem(it);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `move:${it.kind}:${it.id}`);
  };

  const handleItemDragEnd = () => setDragItem(null);

  const handleItemDrop = async (it: CalItem, dayKey: string, startMin: number) => {
    setDragItem(null);
    const day = parseDate(dayKey);
    if (!day) return;
    try {
      if (it.allDay) {
        const startStr = toDateInput(day);
        const endStr = toDateInput(addDays(day, 1));
        if (it.kind === "meeting") {
          await api.update<Meeting>(`/api/meetings/${it.id}`, {
            starts_at: startStr,
            ends_at: endStr,
          });
          refresh();
        } else if (it.kind === "event") {
          const ev = events.data?.find((e) => e.id === it.id);
          if (!ev) return;
          await invoke<CalendarEvent>("cal_event_update", {
            id: it.id,
            title: ev.summary ?? "",
            startsAt: startStr,
            endsAt: endStr,
            allDay: true,
            location: ev.location ?? null,
            notes: ev.description ?? null,
            rrule: ev.rrule ?? null,
            exdates: ev.exdates ?? null,
          });
          refresh();
        }
        return;
      }
      const durMin =
        it.end && it.end.getTime() > it.start.getTime()
          ? Math.round((it.end.getTime() - it.start.getTime()) / 60000)
          : 30;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(startMin / 60), startMin % 60);
      const end = new Date(start.getTime() + Math.max(durMin, 15) * 60000);
      if (it.kind === "meeting") {
        await api.update<Meeting>(`/api/meetings/${it.id}`, {
          starts_at: toLocalInput(start),
          ends_at: toLocalInput(end),
        });
        refresh();
      } else if (it.kind === "event") {
        const ev = events.data?.find((e) => e.id === it.id);
        if (!ev) return;
        await invoke<CalendarEvent>("cal_event_update", {
          id: it.id,
          title: ev.summary ?? "",
          startsAt: toLocalInput(start),
          endsAt: toLocalInput(end),
          allDay: false,
          location: ev.location ?? null,
          notes: ev.description ?? null,
          rrule: ev.rrule ?? null,
          exdates: ev.exdates ?? null,
        });
        refresh();
      }
    } catch (err) {
      console.error("Failed to move item:", err);
    }
  };

  const items = useMemo<CalItem[]>(() => {
    const out: CalItem[] = [];
    const calByHref = new Map((status?.calendars ?? []).map((c) => [c.href, c]));
    for (const e of events.data || []) {
      if (!e.summary) continue;
      const start = parseDate(e.starts_at);
      if (!start) continue;
      const cal = e.calendar_href ? calByHref.get(e.calendar_href) : undefined;
      const allDay = isDateOnly(e.starts_at);
      const calColor = normalizeColor(cal?.color ?? null);
      out.push({
        key: `event-${e.id}`,
        kind: "event",
        id: e.id,
        title: e.summary,
        start,
        end: parseDate(e.ends_at),
        allDay,
        color: calColor ?? autoColor(e.calendar_href || "unknown"),
        calendarKey: e.calendar_href ?? "",
      });
    }
    for (const a of assignments.data || []) {
      if (a.status === "done" || a.status === "graded") continue;
      const start = parseDate(a.due_at);
      if (!start) continue;
      out.push({
        key: `assignment-${a.id}`,
        kind: "assignment",
        id: a.id,
        title: a.title,
        start,
        end: start,
        allDay: isDateOnly(a.due_at),
        color: "#f59e0b",
        calendarKey: "assignment",
      });
    }
    for (const m of meetings.data || []) {
      const start = parseDate(m.starts_at);
      if (!start) continue;
      out.push({
        key: `meeting-${m.id}`,
        kind: "meeting",
        id: m.id,
        title: m.title,
        start,
        end: parseDate(m.ends_at),
        allDay: isDateOnly(m.starts_at),
        color: "#14b8a6",
        calendarKey: "meeting",
      });
    }
    return out;
  }, [events.data, assignments.data, meetings.data, status?.calendars]);

  const visible = useMemo(() => {
    return items.filter((it) => {
      if (it.kind === "event") return !hidden.has(it.calendarKey);
      if (it.kind === "assignment") return showAssignments;
      return showMeetings;
    });
  }, [items, hidden, showAssignments, showMeetings]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const push = (key: string, item: CalItem) => {
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    };
    for (const it of visible) {
      const start = new Date(it.start.getFullYear(), it.start.getMonth(), it.start.getDate());
      const last =
        it.end && it.end.getTime() > it.start.getTime() && dayKey(it.end) !== dayKey(it.start)
          ? new Date(it.end.getFullYear(), it.end.getMonth(), it.end.getDate() - 1)
          : start;
      const cursor = new Date(start);
      while (cursor.getTime() <= last.getTime()) {
        push(dayKey(cursor), it);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ta = a.allDay ? 0 : a.start.getTime();
        const tb = b.allDay ? 0 : b.start.getTime();
        return ta - tb;
      });
    }
    return map;
  }, [visible]);

  const byDayKey = (key: string) => byDay.get(key) ?? [];

  const openEvent = (e: CalendarEvent | "new", date: Date | null, cal: string | null, start?: Date | null, end?: Date | null) => {
    setNewEventDefaults({ date, cal, start: start ?? null, end: end ?? null });
    setEventModal(e);
  };

  const toggleAssignment = async (a: Assignment) => {
    const next = a.status === "done" ? "todo" : "done";
    await api.update<Assignment>(`/api/assignments/${a.id}`, { status: next });
    refresh();
  };

  const goPrev = () => {
    if (view === "month") setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
    else if (view === "week") setAnchor((a) => addDays(a, -7));
    else setAnchor((a) => addDays(a, view === "day" ? -1 : -7));
  };

  const goNext = () => {
    if (view === "month") setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
    else if (view === "week") setAnchor((a) => addDays(a, 7));
    else setAnchor((a) => addDays(a, view === "day" ? 1 : 7));
  };

  const goToday = () => setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const switchView = (v: ViewMode) => {
    setView(v);
    if (v === "week" || v === "day") {
      setAnchor((a) =>
        a.getFullYear() === today.getFullYear() && a.getMonth() === today.getMonth()
          ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
          : a,
      );
    }
  };

  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, key: dayKey(d), inMonth: d.getMonth() === anchor.getMonth() };
    });
  }, [anchor]);

  const weekDays = useMemo(() => {
    const sunday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
      return { date: d, key: dayKey(d) };
    });
  }, [anchor]);

  const agendaDays = useMemo(() => {
    const days: { key: string; date: Date }[] = [];
    for (let i = 0; i < 90; i++) {
      const d = addDays(anchor, i);
      days.push({ key: dayKey(d), date: d });
    }
    return days;
  }, [anchor]);

  const headerLabel = useMemo(() => {
    if (view === "month") return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (view === "week") {
      const s = weekDays[0].date;
      const e = weekDays[6].date;
      return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (view === "day") return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return `Agenda · from ${anchor.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }, [view, anchor, weekDays]);

  const selectedDayItems = selectedDay ? byDayKey(selectedDay) : [];

  const viewButtons: { id: ViewMode; label: string }[] = [
    { id: "month", label: "Month" },
    { id: "week", label: "Week" },
    { id: "day", label: "Day" },
    { id: "agenda", label: "Agenda" },
  ];

  return (
    <div className={`mx-auto flex gap-5 ${view === "week" || view === "day" ? "max-w-7xl" : "max-w-6xl"}`}>
      <aside
        className={`w-52 shrink-0 space-y-4 overflow-hidden transition-all duration-300 ease-in-out ${
          sidebarOpen ? "max-w-52 opacity-100" : "w-0 max-w-0 opacity-0 pointer-events-none"
        }`}
      >
          <Button
            onClick={() => openEvent("new", new Date(), pushHref)}
            disabled={!tauri || !connected}
            className="w-full"
          >
            + New event
          </Button>
          {!connected && (
            <p className="text-center text-[11px] text-slate-500">Connect iCloud in Integrations to add events</p>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Calendars</p>
            <div className="space-y-1">
              {status?.calendars.length === 0 && (
                <p className="text-xs text-slate-500">
                  {connected ? "No calendars selected." : "Not connected. Set up iCloud in Integrations."}
                </p>
              )}
              {(status?.calendars ?? []).map((c) => {
                const checked = !hidden.has(c.href);
                return (
                  <label key={c.href} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-indigo-500"
                      checked={checked}
                      onChange={() =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.href)) next.delete(c.href);
                          else next.add(c.href);
                          return next;
                        })
                      }
                    />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: normalizeColor(c.color) ?? c.color ?? "#6366f1" }} />
                    <span className="min-w-0 truncate text-sm text-slate-400">{c.name || c.href}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">
                      {(normalizeColor(c.color) ?? c.color ?? "auto").toUpperCase()}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">School Hub</p>
            <div className="space-y-1">
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-amber-500"
                  checked={showAssignments}
                  onChange={(e) => setShowAssignments(e.target.checked)}
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-amber-500" />
                <span className="text-sm text-slate-400">Assignments</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-teal-500"
                  checked={showMeetings}
                  onChange={(e) => setShowMeetings(e.target.checked)}
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-teal-500" />
                <span className="text-sm text-slate-400">Meetings</span>
              </label>
            </div>
          </div>
          {status?.last_sync_at && (
            <p className="text-[11px] leading-relaxed text-slate-500">
              Last sync {new Date(status.last_sync_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
          {status?.last_sync_error && <p className="text-[11px] leading-relaxed text-rose-600">{status.last_sync_error}</p>}
        </aside>

      <main className="min-w-0 flex-1 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
            <p className="text-sm text-slate-500">Everything at a glance</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? "Hide calendar list" : "Show calendar list"}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-400 transition-colors hover:bg-slate-100"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="4" width="14" height="12" rx="2" />
                <line x1="8" y1="4" x2="8" y2="16" />
              </svg>
            </button>
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              {viewButtons.map((v) => (
                <button
                  key={v.id}
                  onClick={() => switchView(v.id)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    view === v.id ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={goPrev} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-100">‹</button>
              <button onClick={goToday} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-100">Today</button>
              <button onClick={goNext} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-100">›</button>
            </div>
            <button
              onClick={syncNow}
              disabled={!tauri || !connected || syncing}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-100 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
            {!sidebarOpen && (
              <Button onClick={() => openEvent("new", new Date(), pushHref)} disabled={!tauri || !connected} className="px-3 py-1.5 text-sm">
                + New event
              </Button>
            )}
            <span className="ml-1 text-lg font-semibold text-slate-900">{headerLabel}</span>
          </div>
        </header>

        <div key={view} className="animate-fade-slide">
          {view === "month" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid grid-cols-7 border-b border-slate-200">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((c) => {
                const items = byDayKey(c.key);
                const isToday = c.key === todayKey;
                return (
                  <button
                    key={c.key}
                    onClick={() => {
                      setAnchor(c.date);
                      setSelectedDay(c.key);
                    }}
                    onDragOver={(e) => {
                      if (!dragItem) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      if (!dragItem) return;
                      e.preventDefault();
                      e.stopPropagation();
                      handleItemDrop(dragItem, c.key, 0);
                    }}
                    className={`flex min-h-20 flex-col items-stretch gap-1 border-b border-r border-slate-200 p-1.5 text-left transition-colors last:border-r-0 hover:bg-slate-100 ${
                      c.inMonth ? "bg-transparent" : "bg-slate-100/60"
                    } ${dragItem ? "cursor-grabbing" : ""}`}
                  >
                    <span
                      className={`self-start rounded-full px-1.5 py-0.5 text-xs font-medium ${
                        isToday ? "bg-indigo-500 text-white" : c.inMonth ? "text-slate-400" : "text-slate-400"
                      }`}
                    >
                      {c.date.getDate()}
                    </span>
                    <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
                      {items.slice(0, 3).map((it) => (
                        <ItemChip
                          key={it.key}
                          item={it}
                          onClick={() => openItem(it)}
                          onDragStart={dragItem ? undefined : handleItemDragStart}
                          onDragEnd={handleItemDragEnd}
                        />
                      ))}
                      {items.length > 3 && (
                        <span className="block px-1 text-[11px] text-slate-500">+{items.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === "week" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex border-b border-slate-200">
              <div className="w-14 shrink-0" />
              {weekDays.map((d) => (
                <div
                  key={d.key}
                  className={`min-w-0 flex-1 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider ${
                    d.key === todayKey ? "text-indigo-600" : "text-slate-500"
                  }`}
                >
                  {d.date.toLocaleDateString(undefined, { weekday: "short" })}{" "}
                  <span className={d.key === todayKey ? "rounded-full bg-indigo-500 px-1.5 py-0.5 text-white" : ""}>
                    {d.date.getDate()}
                  </span>
                </div>
              ))}
            </div>
            <div className="max-h-[680px] overflow-auto">
              <div className="flex min-w-[760px]">
                <div className="relative w-14 shrink-0 select-none" style={{ height: DAY_H }}>
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-slate-500"
                      style={{ top: h * HOUR_H }}
                    >
                      {fmtHour(h)}
                    </div>
                  ))}
                </div>
                {weekDays.map((d) => (
                  <DayColumn
                    key={d.key}
                    dayKey={d.key}
                    items={byDayKey(d.key)}
                    isToday={d.key === todayKey}
                    drag={drag?.dayKey === d.key ? drag : null}
                    dragItem={dragItem}
                    onMouseDown={(e) => beginDrag(d.key, e)}
                    onItemClick={openItem}
                    onItemDragStart={handleItemDragStart}
                    onItemDragEnd={handleItemDragEnd}
                    onItemDrop={handleItemDrop}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {view === "day" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <p className={`text-sm font-semibold ${dayKey(anchor) === todayKey ? "text-indigo-600" : "text-slate-400"}`}>
                {anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              {dayKey(anchor) === todayKey && <span className="text-xs font-medium text-indigo-600">Today</span>}
            </div>
            <div className="max-h-[680px] overflow-y-auto">
              <div className="flex">
                <div className="relative w-14 shrink-0 select-none" style={{ height: DAY_H }}>
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-slate-500"
                      style={{ top: h * HOUR_H }}
                    >
                      {fmtHour(h)}
                    </div>
                  ))}
                </div>
                <DayColumn
                  dayKey={dayKey(anchor)}
                  items={byDayKey(dayKey(anchor))}
                  isToday={dayKey(anchor) === todayKey}
                  drag={drag?.dayKey === dayKey(anchor) ? drag : null}
                  dragItem={dragItem}
                  onMouseDown={(e) => beginDrag(dayKey(anchor), e)}
                  onItemClick={openItem}
                  onItemDragStart={handleItemDragStart}
                  onItemDragEnd={handleItemDragEnd}
                  onItemDrop={handleItemDrop}
                />
              </div>
            </div>
          </div>
        )}

        {view === "agenda" && (
          <div className="space-y-5">
            {agendaDays.map((d) => {
              const items = byDayKey(d.key);
              if (items.length === 0) return null;
              const isToday = d.key === todayKey;
              return (
                <div key={d.key} className="flex gap-3">
                  <div
                    className={`w-28 shrink-0 pt-1 text-right ${dragItem ? "cursor-grabbing" : ""}`}
                    onDragOver={(e) => {
                      if (!dragItem) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      if (!dragItem) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const startMin = dragItem.start.getHours() * 60 + dragItem.start.getMinutes();
                      handleItemDrop(dragItem, d.key, startMin);
                    }}
                  >
                    <p className={`text-sm font-semibold ${isToday ? "text-indigo-600" : "text-slate-700"}`}>
                      {d.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    {isToday && <p className="text-xs text-indigo-500">Today</p>}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 border-l border-slate-200 pl-4">
                    {items.map((it) => {
                      if (it.kind === "assignment") {
                        const a = assignments.data?.find((x) => x.id === it.id);
                        return (
                          <div
                            key={it.key}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-slate-100"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-amber-500"
                              checked={false}
                              onChange={() => a && toggleAssignment(a)}
                            />
                            <button onClick={() => setAssignmentModal(a ?? null)} className="min-w-0 flex-1 text-left">
                              <p className="truncate text-sm font-medium text-slate-900">{it.title}</p>
                              <p className="text-xs text-slate-500">{fmtRange(it)}</p>
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={it.key}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", `move:${it.kind}:${it.id}`);
                            setDragItem(it);
                          }}
                          onDragEnd={() => setDragItem(null)}
                          onClick={() => openItem(it)}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-slate-100 ${
                            dragItem?.id === it.id ? "opacity-40" : ""
                          }`}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{it.title}</span>
                          <span className="shrink-0 text-xs text-slate-500">{fmtRange(it)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </main>

      <Modal open={selectedDay !== null} onClose={() => setSelectedDay(null)} title={selectedDay ?? ""}>
        {selectedDayItems.length === 0 ? (
          <EmptyState icon="🌤️" title="Nothing scheduled" hint="A free day" />
        ) : (
          <div className="space-y-2">
            {selectedDayItems.map((it) => (
              <div
                key={it.key}
                onClick={() => openItem(it)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:bg-slate-100"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{it.title}</p>
                    <p className="text-xs text-slate-500">
                      {it.kind === "event" ? "Calendar event" : it.kind === "assignment" ? "Assignment" : "Meeting"}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{fmtRange(it)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => {
              const d = parseDate(selectedDay ?? "");
              setSelectedDay(null);
              openEvent("new", d, pushHref);
            }}
            disabled={!tauri || !connected}
          >
            New event
          </Button>
        </div>
      </Modal>

      <EventModal
        state={eventModal}
        onClose={() => setEventModal(null)}
        onDone={refresh}
        calendars={status?.calendars ?? []}
        defaultDate={newEventDefaults.date}
        defaultCalHref={newEventDefaults.cal}
        defaultStart={newEventDefaults.start}
        defaultEnd={newEventDefaults.end}
      />
      <AssignmentModal state={assignmentModal} onClose={() => setAssignmentModal(null)} onDone={refresh} />
      <MeetingModal state={meetingModal} onClose={() => setMeetingModal(null)} onDone={refresh} />
    </div>
  );

  function openItem(it: CalItem) {
    if (it.kind === "event") {
      const ev = events.data?.find((e) => e.id === it.id) ?? null;
      openEvent(ev ?? "new", null, null);
    } else if (it.kind === "assignment") {
      setAssignmentModal(assignments.data?.find((a) => a.id === it.id) ?? null);
    } else {
      setMeetingModal(meetings.data?.find((m) => m.id === it.id) ?? null);
    }
  }
}
