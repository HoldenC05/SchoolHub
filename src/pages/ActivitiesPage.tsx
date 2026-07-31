import { useState } from "react";
import { useData, useCreate, useUpdate, useDelete } from "../lib/useData";
import type { Activity } from "../lib/types";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  Field,
  IconButton,
  Modal,
  TextInput,
} from "../components/ui";

const COLOR_OPTIONS = ["#22d3ee", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#fb923c", "#94a3b8"];
const ICON_OPTIONS = ["🤖", "⚽", "🎨", "🎵", "🗞️", "💻", "🏕️", "🎭", "🧠", "🙋"];

export function ActivitiesPage({
  onOpenActivity,
}: {
  onOpenActivity: (id: number) => void;
}) {
  const { data: activities, refresh, loading } = useData<Activity[]>("/api/activities");
  const { remove } = useDelete("/api/activities");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Activities</h1>
          <p className="text-sm text-slate-400">Clubs, teams, and everything you do</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Add activity</Button>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !activities || activities.length === 0 ? (
        <EmptyState icon="🎯" title="No activities yet" hint="Add a club, sport, or org" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {activities.map((a) => (
            <Card key={a.id} className="group flex items-center gap-3">
              <button onClick={() => onOpenActivity(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
                  style={{ backgroundColor: (a.color || "#334155") + "33" }}
                >
                  {a.icon || a.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-100">{a.name}</span>
                  <span className="block text-sm text-slate-500">{a.category || "Activity"}</span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <IconButton
                  title="Edit"
                  onClick={() => {
                    setEditing(a);
                    setModalOpen(true);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                </IconButton>
                <DeleteButton
                  onConfirm={async () => {
                    await remove(a.id);
                    refresh();
                  }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <ActivityModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onDone={refresh}
        initial={editing ?? undefined}
      />
    </div>
  );
}

function ActivityModal({
  open,
  onClose,
  onDone,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initial?: Activity;
}) {
  const editing = Boolean(initial);
  const { create, error: createError } = useCreate<Activity>("/api/activities", () => {
    onClose();
    onDone();
  });
  const { update, error: updateError } = useUpdate<Activity>("/api/activities");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [color, setColor] = useState(initial?.color ?? COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState(initial?.icon ?? ICON_OPTIONS[0]);
  const error = createError || updateError;

  const save = async () => {
    if (!name.trim()) return;
    const body = {
      name: name.trim(),
      category: category.trim() || null,
      contact: contact.trim() || null,
      color,
      icon,
    };
    if (initial) {
      const ok = await update(initial.id, body);
      if (ok) {
        onClose();
        onDone();
      }
    } else {
      create(body);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit activity" : "Add an activity"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name">
          <TextInput value={name} onChange={setName} placeholder="e.g. Robotics Club" />
        </Field>
        <Field label="Category">
          <TextInput value={category} onChange={setCategory} placeholder="e.g. Club, Sport, Volunteer" />
        </Field>
        <Field label="Contact / advisor">
          <TextInput value={contact} onChange={setContact} placeholder="e.g. Mr. Kim (room 214)" />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-400">Color</p>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-white" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-400">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors ${
                  icon === i ? "bg-indigo-500/20 ring-1 ring-indigo-400" : "hover:bg-slate-800"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-rose-400">{error.message}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}
