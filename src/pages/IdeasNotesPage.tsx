import { useState } from "react";
import { useData, useCreate, useDelete } from "../lib/useData";
import type { Idea } from "../lib/types";
import { api } from "../lib/api";
import { TodoList } from "../components/TodoList";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  IconButton,
  TextInput,
} from "../components/ui";

const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M5.5 3.5h8M5.5 8h8M5.5 12.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M2.5 3.5h.01M2.5 8h.01M2.5 12.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export function IdeasPage() {
  const { data: ideas, refresh, loading } = useData<Idea[]>("/api/ideas");
  const { create, error } = useCreate<Idea>("/api/ideas", refresh);
  const { remove } = useDelete("/api/ideas");
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = async (idea: Idea) => {
    await api.update(`/api/ideas/${idea.id}`, { done: idea.done ? 0 : 1 });
    refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Ideas</h1>
        <p className="text-sm text-slate-500">Quick capture — brain dumps, plans, random thoughts</p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            create({ title: text.trim() });
            setText("");
          }
        }}
      >
        <div className="flex-1">
          <TextInput value={text} onChange={setText} placeholder="Capture an idea…" />
        </div>
        <Button type="submit">Add</Button>
      </form>
      {error && <p className="text-xs text-rose-600">{error.message}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !ideas || ideas.length === 0 ? (
        <EmptyState icon="💡" title="No ideas yet" hint="Capture the first one above" />
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <div key={idea.id}>
              <Card
                className={`group flex items-start gap-3 ${idea.done ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={idea.done === 1}
                  onChange={() => toggle(idea)}
                  className="mt-1 h-4 w-4 accent-indigo-500"
                />
                <div className="min-w-0 flex-1">
                  <p className={`font-medium text-slate-900 ${idea.done ? "line-through" : ""}`}>
                    {idea.title}
                  </p>
                  {idea.body && <p className="text-sm text-slate-500">{idea.body}</p>}
                </div>
                <IconButton
                  title={expanded === idea.id ? "Hide to-dos" : "Show to-dos"}
                  onClick={() => setExpanded(expanded === idea.id ? null : idea.id)}
                >
                  <ListIcon />
                </IconButton>
                <DeleteButton
                  onConfirm={async () => {
                    await remove(idea.id);
                    refresh();
                  }}
                />
              </Card>
              {expanded === idea.id && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <TodoList entityType="idea" entityId={idea.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
