import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  type HubEvent,
  HubEventSchema,
  type RenderJob,
  type RendersOverview,
} from "../shared/types.ts";
import { queryKeys } from "./api.ts";

type Listener = (event: HubEvent) => void;
const listeners = new Set<Listener>();

/**
 * Opens the hub's live event stream (mount once, in App). Film and workspace changes refresh the
 * matching queries, then go to every `useHubEvent` listener.
 */
export function useHubEventStream(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");
    let dropped = false;

    source.onerror = () => {
      dropped = true;
    };
    // After a reconnect (the hub restarted), things may have changed while we weren't listening.
    source.onopen = () => {
      if (dropped) queryClient.invalidateQueries();
      dropped = false;
    };
    source.onmessage = (message) => {
      let data: unknown;
      try {
        data = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = HubEventSchema.safeParse(data);
      if (!parsed.success) return;
      const event = parsed.data;

      if (event.type === "workspace-changed") {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace });
        queryClient.invalidateQueries({ queryKey: queryKeys.films });
      } else if (event.type === "notes-changed") {
        queryClient.invalidateQueries({ queryKey: queryKeys.notes(event.id) });
      } else if (event.type === "render-progress") {
        // Progress comes often: update the job in place instead of asking the hub again.
        queryClient.setQueryData<RendersOverview>(queryKeys.renders, (old) =>
          old ? { ...old, jobs: withJob(old.jobs, event.job) } : old,
        );
      } else if (event.type === "renders-changed") {
        queryClient.invalidateQueries({ queryKey: queryKeys.renders });
      } else if (event.type === "references-changed") {
        queryClient.invalidateQueries({ queryKey: queryKeys.references(event.id) });
      } else if (event.type === "writer-progress") {
        queryClient.setQueryData(queryKeys.writer(event.id), event.writer);
      } else if (event.type === "assets-changed") {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets });
      } else {
        // Covers the list and each changed film (["films", id]).
        queryClient.invalidateQueries({ queryKey: queryKeys.films });
      }
      for (const listener of listeners) listener(event);
    };

    return () => source.close();
  }, [queryClient]);
}

/** The job list with `job` updated, or added first (the list is newest first). */
export function withJob(jobs: readonly RenderJob[], job: RenderJob): RenderJob[] {
  return jobs.some((entry) => entry.id === job.id)
    ? jobs.map((entry) => (entry.id === job.id ? job : entry))
    : [job, ...jobs];
}

/** Calls `listener` for every hub event while the component is mounted. */
export function useHubEvent(listener: Listener): void {
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });

  useEffect(() => {
    const forward: Listener = (event) => latest.current(event);
    listeners.add(forward);
    return () => {
      listeners.delete(forward);
    };
  }, []);
}
