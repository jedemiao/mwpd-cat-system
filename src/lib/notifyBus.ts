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

// The reply going up to the Division Chief and coming back down. These are the
// two moments where work changes hands and the other person cannot see it
// happen — a reply sits "for checking" on a board nobody is looking at, and a
// returned one sits unread until its author happens to open the module.
//
// Carries the version number because that is what the two people will say to
// each other about it ("v2 is back"), and a routing number that can be null:
// an originated dispatch is not numbered until it is released.
export type OutgoingReviewEvent = {
  type: "outgoing-submitted" | "outgoing-returned" | "outgoing-approved";
  documentId: string;
  routingNumber: string | null;
  documentTitle: string;
  versionNumber: number;
};

// A document handed over between divisions. Two moments, and the same reason
// as the outgoing review events: neither side can see the other's ledger, so
// without this a delivery sits in a tray nobody has been told about, and the
// sender goes on wondering whether it arrived.
export type DeliveryEvent = {
  type: "delivery-arrived" | "delivery-received";
  // The delivery row for an arrival; the sender's own dispatch for an
  // acknowledgement — each side is sent the id it can actually open.
  documentId: string;
  routingNumber: string | null;
  documentTitle: string;
  // The other division, by code — the first thing either side wants to know.
  officeCode: string;
};

export type NotifyEvent =
  | IncomingRoutedEvent
  | IncomingClearedEvent
  | OutgoingReviewEvent
  | DeliveryEvent;

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
