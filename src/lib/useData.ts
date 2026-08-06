import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const refreshListeners = new Set<() => void>();

export function invalidateCache(path: string) {
  cache.delete(path);
  for (const key of cache.keys()) {
    if (key.startsWith(`${path}/`)) cache.delete(key);
  }
}

export function refreshAll() {
  cache.clear();
  for (const listener of refreshListeners) listener();
}

export function useData<T>(path: string, reloadKey = 0) {
  const [data, setData] = useState<T | null>(() => (cache.get(path) as T) ?? null);
  const [loading, setLoading] = useState(() => !cache.has(path));
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    if (!cache.has(path)) setLoading(true);
    let promise = inflight.get(path);
    if (!promise) {
      promise = api
        .get<T>(path)
        .then((d) => {
          cache.set(path, d);
          return d;
        })
        .finally(() => inflight.delete(path));
      inflight.set(path, promise);
    }
    try {
      const d = await promise;
      setData(d as T);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    refresh();
  }, [refresh, reloadKey]);

  useEffect(() => {
    refreshListeners.add(refresh);
    return () => {
      refreshListeners.delete(refresh);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function useCreate<T>(path: string, onDone?: () => void) {
  const [error, setError] = useState<Error | null>(null);
  const create = useCallback(
    async (body: unknown) => {
      setError(null);
      try {
        await api.create<T>(path, body);
        invalidateCache(path);
        onDone?.();
      } catch (e) {
        setError(e as Error);
      }
    },
    [path, onDone],
  );
  return { create, error };
}

export function useUpdate<T>(path: string) {
  const [error, setError] = useState<Error | null>(null);
  const update = useCallback(
    async (id: number, body: unknown): Promise<T | null> => {
      setError(null);
      try {
        const row = await api.update<T>(`${path}/${id}`, body);
        invalidateCache(path);
        return row;
      } catch (e) {
        setError(e as Error);
        return null;
      }
    },
    [path],
  );
  return { update, error };
}

export function useDelete(path: string) {
  const [error, setError] = useState<Error | null>(null);
  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      setError(null);
      try {
        await api.remove(`${path}/${id}`);
        invalidateCache(path);
        return true;
      } catch (e) {
        setError(e as Error);
        return false;
      }
    },
    [path],
  );
  return { remove, error };
}
