import { EventEmitter } from "events";

// Single-process, in-memory pub/sub for live notifications. This app runs as
// one Next.js container (see docker-compose.yml) with no Redis/queue, so a
// module-level EventEmitter is sufficient — it would need to move to a real
// pub/sub broker only if the app ever scales to multiple instances.
export const notifyBus = new EventEmitter();
notifyBus.setMaxListeners(0); // small office roster; unbounded is fine

export type IncomingRoutedEvent = {
  type: "incoming-routed";
  documentId: string;
  routingNumber: string;
  documentTitle: string;
};

export type IncomingClearedEvent = {
  type: "incoming-unrouted" | "incoming-completed";
  documentId: string;
};

export type NotifyEvent = IncomingRoutedEvent | IncomingClearedEvent;

function channel(userId: string) {
  return `user:${userId}`;
}

export function publishToUser(userId: string, event: NotifyEvent) {
  notifyBus.emit(channel(userId), event);
}

export function subscribeToUser(userId: string, listener: (event: NotifyEvent) => void) {
  notifyBus.on(channel(userId), listener);
  return () => notifyBus.off(channel(userId), listener);
}
