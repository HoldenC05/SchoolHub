import { useEffect, useState } from "react";
import { dismiss, getUndoActions, subscribeUndo, tableLabel, undo, type UndoAction } from "../lib/undo";

export function UndoToast() {
  const [actions, setActions] = useState<UndoAction[]>(() => getUndoActions());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const unsub = subscribeUndo(setActions);
    return unsub;
  }, []);

  const action = actions[actions.length - 1];
  useEffect(() => {
    setFailed(false);
  }, [action?.id]);

  if (!action) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-lg">
      <span className="text-sm text-slate-700">
        {failed ? "Couldn't restore." : `Deleted ${tableLabel(action.table).toLowerCase()} · Undo`}
      </span>
      <button
        onClick={() => void undo(action.id).then((ok) => setFailed(!ok))}
        className="rounded-md bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
      >
        Undo
      </button>
      <button
        onClick={() => dismiss(action.id)}
        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
