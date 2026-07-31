import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export function useData<T>(path: string, reloadKey = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    refresh();
  }, [refresh, reloadKey]);

  return { data, loading, error, refresh };
}

export function useCreate<T>(path: string, onDone?: () => void) {
  const [error, setError] = useState<Error | null>(null);
  const create = useCallback(
    async (body: unknown) => {
      setError(null);
      try {
        await api.create<T>(path, body);
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
        return await api.update<T>(`${path}/${id}`, body);
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
