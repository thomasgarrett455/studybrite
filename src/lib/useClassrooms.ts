import { useCallback, useEffect, useState } from "react";
import { listClassrooms, createClassroom as createClassroomApi } from "./api";
import type { Classroom } from "./api";

// Loads the user's classrooms and exposes a `create` action that refreshes the list.
export function useClassrooms() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Silent after the first load: re-fetches swap the list in place instead of
  // flashing the sidebar back to "Loading…" on every refresh.
  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { classrooms } = await listClassrooms();
      setClassrooms(classrooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load classrooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (name: string) => {
    const { classroom } = await createClassroomApi(name);
    // Optimistically prepend the new classroom (list is newest-first).
    setClassrooms((prev) => [classroom, ...prev]);
    return classroom;
  }, []);

  return { classrooms, loading, error, refresh, create };
}
