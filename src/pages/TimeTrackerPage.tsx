import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/useData";
import type { Activity, Course, TimeCategory, TimeEntry } from "../lib/types";
import { entryDuration, fmtDuration, fmtDurationClock, fmtEntryDate, isRunning } from "../lib/time";
import { Button, Card, DeleteButton, Field, Modal, SelectInput, TextInput, inputStyles } from "../components/ui";

type CatSel = { type: TimeCategory; id: number | null; label: string };

export function TimeTrackerPage() {
  const { data, refresh } = useData<TimeEntry[]>("/api/time_entries");
  const courses = useData<Course[]>("/api/courses");
  const activities = useData<Activity[]>("/api/activities");
  const [now, setNow] = useState(new Date());

  const entries = data || [];
  const running = entries.find(isRunning);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const [catType, setCatType] = useState<TimeCategory>("course");
  const [catId, setCatId] = useState<number | null>(null);
  const [otherLabel, setOtherLabel] = useState("");

  const [manualOpen, setManualOpen] = useState(false);
  const [manualStart, setManualStart] = useState("");
  const [manualH, setManualH] = useState("");
  const [manualM, setManualM] = useState("");

  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editH, setEditH] = useState("");
  const [editM, setEditM] = useState("");
  const [editType, setEditType] = useState<TimeCategory>("course");
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const courseOptions = (courses.data || []).map((c) => ({ value: c.id, label: `📚 ${c.name}` }));
  const activityOptions = (activities.data || []).map((a) => ({ value: a.id, label: `${a.icon || "🏅"} ${a.name}` }));

  const resolveLabel = (e: TimeEntry): string => {
    if (e.entity_type === "course") return e.label || courses.data?.find((c) => c.id === e.entity_id)?.name || "Course";
    if (e.entity_type === "activity") return e.label || activities.data?.find((a) => a.id === e.entity_id)?.name || "Activity";
    return e.label || "Other";
  };

  const currentSelection = (): CatSel => {
    if (catType === "course") {
      const c = courses.data?.find((x) => x.id === catId);
      return { type: "course", id: catId, label: c?.name || "Course" };
    }
    if (catType === "activity") {
      const a = activities.data?.find((x) => x.id === catId);
      return { type: "activity", id: catId, label: a?.name || "Activity" };
    }
    return { type: "other", id: null, label: otherLabel.trim() || "Other" };
  };

  const start = async () => {
    if (running) return;
    const sel = currentSelection();
    await api.create<TimeEntry>("/api/time_entries", {
      entity_type: sel.type,
      entity_id: sel.id,
      label: sel.label,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: 0,
    });
    refresh();
  };

  const stop = async () => {
    if (!running) return;
    await api.update<TimeEntry>(`/api/time_entries/${running.id}`, {
      ended_at: new Date().toISOString(),
      duration_seconds: entryDuration(running, now),
    });
    refresh();
  };

  const addManual = async () => {
    const startIso = manualStart ? new Date(manualStart).toISOString() : new Date().toISOString();
    const dur = (Number(manualH) || 0) * 3600 + (Number(manualM) || 0) * 60;
    if (dur <= 0) return;
    const sel = currentSelection();
    await api.create<TimeEntry>("/api/time_entries", {
      entity_type: sel.type,
      entity_id: sel.id,
      label: sel.label,
      started_at: startIso,
      ended_at: new Date(new Date(startIso).getTime() + dur * 1000).toISOString(),
      duration_seconds: dur,
    });
    setManualOpen(false);
    setManualStart("");
    setManualH("");
    setManualM("");
    refresh();
  };

  const openEdit = (e: TimeEntry) => {
    setEditing(e);
    setEditStart(e.started_at ? e.started_at.slice(0, 16) : "");
    const dur = entryDuration(e);
    setEditH(String(Math.floor(dur / 3600)));
    setEditM(String(Math.floor((dur % 3600) / 60)));
    const et = (e.entity_type ?? "other") as TimeCategory;
    setEditType(et);
    setEditId(e.entity_id);
    setEditLabel(e.label ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const dur = (Number(editH) || 0) * 3600 + (Number(editM) || 0) * 60;
    if (dur <= 0) return;
    const startIso = editStart ? new Date(editStart).toISOString() : editing.started_at;
    const label = editType === "course" ? courses.data?.find((c) => c.id === editId)?.name || editLabel : editType === "activity" ? activities.data?.find((a) => a.id === editId)?.name || editLabel : editLabel.trim() || "Other";
    await api.update<TimeEntry>(`/api/time_entries/${editing.id}`, {
      entity_type: editType,
      entity_id: editType === "other" ? null : editId,
      label,
      started_at: startIso,
      ended_at: new Date(new Date(startIso).getTime() + dur * 1000).toISOString(),
      duration_seconds: dur,
    });
    setEditing(null);
    refresh();
  };

  const stats = useMemo(() => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const week = new Date(day);
    week.setDate(week.getDate() - week.getDay());
    let today = 0;
    let thisWeek = 0;
    let all = 0;
    const byLabel = new Map<string, number>();
    for (const e of entries) {
      const dur = entryDuration(e, now);
      const start = new Date(e.started_at);
      all += dur;
      if (start >= day) today += dur;
      if (start >= week) thisWeek += dur;
      const label = resolveLabel(e);
      byLabel.set(label, (byLabel.get(label) ?? 0) + dur);
    }
    const breakdown = [...byLabel.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, seconds]) => ({ label, seconds, pct: all ? Math.round((seconds / all) * 100) : 0 }));
    return { today, thisWeek, all, breakdown };
  }, [entries, now, courses.data, activities.data]);

  const recent = useMemo(
    () => [...entries].sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [entries],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Time Tracker</h1>
        <p className="text-sm text-slate-500">Track where your hours go</p>
      </header>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Category">
            <SelectInput
              value={catType}
              onChange={(v) => {
                setCatType(v as TimeCategory);
                setCatId(null);
              }}
              options={[
                { value: "course", label: "Course" },
                { value: "activity", label: "Activity" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
          {catType === "course" && (
            <Field label="Course">
              <SelectInput
                value={catId === null ? "" : String(catId)}
                onChange={(v) => setCatId(v ? Number(v) : null)}
                options={[{ value: "", label: "— Select —" }, ...courseOptions.map((o) => ({ value: String(o.value), label: o.label }))]}
              />
            </Field>
          )}
          {catType === "activity" && (
            <Field label="Activity">
              <SelectInput
                value={catId === null ? "" : String(catId)}
                onChange={(v) => setCatId(v ? Number(v) : null)}
                options={[{ value: "", label: "— Select —" }, ...activityOptions.map((o) => ({ value: String(o.value), label: o.label }))]}
              />
            </Field>
          )}
          {catType === "other" && (
            <Field label="Label">
              <TextInput value={otherLabel} onChange={setOtherLabel} placeholder="e.g. Planning" />
            </Field>
          )}
          {running ? (
            <Button variant="danger" onClick={() => void stop()}>■ Stop</Button>
          ) : (
            <Button onClick={() => void start()} disabled={catType !== "other" && catId === null}>
              ▶ Start timer
            </Button>
          )}
        </div>

        {running && (
          <div className="flex items-center gap-3 rounded-lg bg-indigo-50 px-4 py-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-indigo-900">{resolveLabel(running)}</p>
              <p className="text-xs text-indigo-500">Started {fmtEntryDate(running.started_at)}</p>
            </div>
            <span className="font-mono text-xl font-bold text-indigo-900">
              {fmtDurationClock(entryDuration(running, now))}
            </span>
          </div>
        )}

        <div className="border-t border-slate-200 pt-3">
          <Button variant="ghost" onClick={() => setManualOpen(true)}>
            + Add manual entry
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card><p className="text-xl font-bold text-slate-900">{fmtDuration(stats.today)}</p><p className="text-sm text-slate-500">Today</p></Card>
        <Card><p className="text-xl font-bold text-slate-900">{fmtDuration(stats.thisWeek)}</p><p className="text-sm text-slate-500">This week</p></Card>
        <Card><p className="text-xl font-bold text-slate-900">{fmtDuration(stats.all)}</p><p className="text-sm text-slate-500">All time</p></Card>
      </div>

      {stats.breakdown.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-semibold text-slate-900">Where your time goes</h2>
          {stats.breakdown.map((b) => (
            <div key={b.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{b.label}</span>
                <span className="text-slate-500">
                  {fmtDuration(b.seconds)} · {b.pct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-semibold text-slate-900">Entries</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No time tracked yet.</p>
        ) : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {recent.map((e) => (
              <div key={e.id} className="group flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{resolveLabel(e)}</p>
                  <p className="text-xs text-slate-400">{fmtEntryDate(e.started_at)}</p>
                </div>
                {isRunning(e) && (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> Running
                  </span>
                )}
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {fmtDuration(entryDuration(e, now))}
                </span>
                <div className="flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(e)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Edit"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <DeleteButton
                    onConfirm={async () => {
                      await api.remove(`/api/time_entries/${e.id}`);
                      refresh();
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Add manual entry">
        <div className="space-y-3">
          <Field label="Start">
            <input type="datetime-local" className={inputStyles} value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours">
              <TextInput value={manualH} onChange={setManualH} placeholder="0" />
            </Field>
            <Field label="Minutes">
              <TextInput value={manualM} onChange={setManualM} placeholder="0" />
            </Field>
          </div>
          <p className="text-xs text-slate-500">Category: {currentSelection().label}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button onClick={() => void addManual()}>Add entry</Button>
          </div>
        </div>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit time entry">
        <div className="space-y-3">
          <Field label="Start">
            <input type="datetime-local" className={inputStyles} value={editStart} onChange={(e) => setEditStart(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours"><TextInput value={editH} onChange={setEditH} /></Field>
            <Field label="Minutes"><TextInput value={editM} onChange={setEditM} /></Field>
          </div>
          <Field label="Category">
            <SelectInput
              value={editType}
              onChange={(v) => {
                setEditType(v as TimeCategory);
                setEditId(null);
              }}
              options={[
                { value: "course", label: "Course" },
                { value: "activity", label: "Activity" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
          {editType === "course" && (
            <Field label="Course">
              <SelectInput
                value={editId === null ? "" : String(editId)}
                onChange={(v) => setEditId(v ? Number(v) : null)}
                options={[{ value: "", label: "— Select —" }, ...courseOptions.map((o) => ({ value: String(o.value), label: o.label }))]}
              />
            </Field>
          )}
          {editType === "activity" && (
            <Field label="Activity">
              <SelectInput
                value={editId === null ? "" : String(editId)}
                onChange={(v) => setEditId(v ? Number(v) : null)}
                options={[{ value: "", label: "— Select —" }, ...activityOptions.map((o) => ({ value: String(o.value), label: o.label }))]}
              />
            </Field>
          )}
          {editType === "other" && (
            <Field label="Label"><TextInput value={editLabel} onChange={setEditLabel} /></Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void saveEdit()}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
