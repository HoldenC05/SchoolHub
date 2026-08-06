import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { refreshAll } from "../lib/useData";
import type { TrashItem } from "../lib/types";
import { TABLE_ICON, tableLabel } from "../lib/undo";
import { Button, EmptyState } from "../components/ui";

function fmtDeleted(iso: string): string {
  const d = new Date(iso + (iso.includes("T") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function TrashPage() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<TrashItem[]>("/api/trash");
      setItems(rows);
    } catch (err) {
      console.error("Failed to load trash:", err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (it: TrashItem) => {
    setBusy(`restore-${it.id}`);
    try {
      await api.create(`/api/trash/${it.table_name}/${it.row_id}/restore`, {});
      refreshAll();
      await load();
    } catch (err) {
      console.error("Restore failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const purge = async (it: TrashItem) => {
    setBusy(`purge-${it.id}`);
    try {
      await api.remove(`/api/trash/${it.id}`);
      await load();
    } catch (err) {
      console.error("Purge failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const emptyAll = async () => {
    setBusy("empty");
    try {
      await api.remove("/api/trash");
      await load();
    } catch (err) {
      console.error("Empty trash failed:", err);
    } finally {
      setBusy(null);
    }
  };

  if (items === null) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trash</h1>
          <p className="text-sm text-slate-500">
            Deleted items live here for 30 days, then are removed for good. Restore anything you still need.
          </p>
        </div>
        {items.length > 0 && (
          <Button variant="danger" onClick={emptyAll} disabled={busy !== null}>
            {busy === "empty" ? "Emptying…" : "Empty trash"}
          </Button>
        )}
      </header>

      {items.length === 0 ? (
        <EmptyState icon="🗑️" title="Trash is empty" hint="Deleted classes, notes, to-dos, and more show up here." />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base">
                {TABLE_ICON[it.table_name] ?? "🗑️"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{it.label || tableLabel(it.table_name)}</p>
                <p className="text-xs text-slate-500">
                  {tableLabel(it.table_name)} · deleted {fmtDeleted(it.deleted_at)}
                </p>
              </div>
              <button
                onClick={() => restore(it)}
                disabled={busy !== null}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                {busy === `restore-${it.id}` ? "Restoring…" : "Restore"}
              </button>
              <button
                onClick={() => purge(it)}
                disabled={busy !== null}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                {busy === `purge-${it.id}` ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
