import { useState } from "react";
import { useData, useCreate, useDelete } from "../lib/useData";
import type { Idea } from "../lib/types";
import { api } from "../lib/api";
import {
  Button,
  Card,
  DeleteButton,
  EmptyState,
  TextInput,
} from "../components/ui";

export function IdeasPage() {
  const { data: ideas, refresh, loading } = useData<Idea[]>("/api/ideas");
  const { create, error } = useCreate<Idea>("/api/ideas", refresh);
  const { remove } = useDelete("/api/ideas");
  const [text, setText] = useState("");

  const toggle = async (idea: Idea) => {
    await api.update(`/api/ideas/${idea.id}`, { done: idea.done ? 0 : 1 });
    refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Ideas</h1>
        <p className="text-sm text-slate-400">Quick capture — brain dumps, plans, random thoughts</p>
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
      {error && <p className="text-xs text-rose-400">{error.message}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !ideas || ideas.length === 0 ? (
        <EmptyState icon="💡" title="No ideas yet" hint="Capture the first one above" />
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <Card
              key={idea.id}
              className={`group flex items-start gap-3 ${idea.done ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={idea.done === 1}
                onChange={() => toggle(idea)}
                className="mt-1 h-4 w-4 accent-indigo-500"
              />
              <div className="min-w-0 flex-1">
                <p className={`font-medium text-slate-100 ${idea.done ? "line-through" : ""}`}>
                  {idea.title}
                </p>
                {idea.body && <p className="text-sm text-slate-500">{idea.body}</p>}
              </div>
              <DeleteButton
                onConfirm={async () => {
                  await remove(idea.id);
                  refresh();
                }}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
