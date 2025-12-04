export type EventDirection = "inbound" | "outbound" | "system";

export type EventType =
  | "webhook.incoming"
  | "simulate.message"
  | "simulate.status"
  | "config.update";

export interface SandboxEvent {
  id: string;
  timestamp: number;
  direction: EventDirection;
  type: EventType;
  source: string;
  payload: unknown;
  meta?: Record<string, unknown>;
}

const events: SandboxEvent[] = [];
const maxEvents = 200;

type Subscriber = (event: SandboxEvent) => void;

const subscribers = new Set<Subscriber>();

export const listEvents = (): SandboxEvent[] => [...events];

export const addEvent = (
  event: Omit<SandboxEvent, "id" | "timestamp">
): SandboxEvent => {
  const enriched: SandboxEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };

  events.push(enriched);
  if (events.length > maxEvents) {
    events.splice(0, events.length - maxEvents);
  }

  for (const subscriber of subscribers) {
    try {
      subscriber(enriched);
    } catch {
      // ignore subscriber errors
    }
  }

  return enriched;
};

export const subscribe = (subscriber: Subscriber): (() => void) => {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
};

