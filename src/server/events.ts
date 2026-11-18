import type { HubEvent } from "../shared/types.ts";

export type HubEventListener = (event: HubEvent) => void;

/** Tiny in-process event bus: the watcher and routes publish, `/api/events` streams to the UI. */
export class EventBus {
  #listeners = new Set<HubEventListener>();

  subscribe(listener: HubEventListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  publish(event: HubEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}
