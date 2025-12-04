import { TemplateCategory } from "./templates";

export type MessagingLimitTier =
  | "TIER_250"
  | "TIER_1K"
  | "TIER_10K"
  | "TIER_100K"
  | "TIER_UNLIMITED";

export type ConversationCategory =
  | TemplateCategory
  | "UNKNOWN";

export interface SendEvent {
  to: string;
  category: ConversationCategory;
  timestamp: number;
  costUsd: number;
}

export interface MessagingLimitState {
  phoneId: string;
  tier: MessagingLimitTier;
  windowMs: number;
  sends: SendEvent[];
  totalCostUsd: number;
}

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Very rough, sandbox-only per-conversation cost approximations in USD
const CATEGORY_COST: Record<ConversationCategory, number> = {
  MARKETING: 0.05,
  UTILITY: 0.03,
  AUTHENTICATION: 0.02,
  UNKNOWN: 0.025,
};

const TIER_LIMITS: Record<MessagingLimitTier, number> = {
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

const states = new Map<string, MessagingLimitState>();

const getOrCreateState = (phoneId: string): MessagingLimitState => {
  const existing = states.get(phoneId);
  if (existing) return existing;

  const fresh: MessagingLimitState = {
    phoneId,
    tier: "TIER_1K",
    windowMs: DEFAULT_WINDOW_MS,
    sends: [],
    totalCostUsd: 0,
  };
  states.set(phoneId, fresh);
  return fresh;
};

export interface MessagingLimitEvaluation {
  allowed: boolean;
  reason?: string;
  tier: MessagingLimitTier;
  windowUniqueRecipients: number;
  limitUniqueRecipients: number;
}

export const evaluateMessagingLimit = (params: {
  phoneId: string;
  to: string;
  now?: number;
}): MessagingLimitEvaluation => {
  const now = params.now ?? Date.now();
  const state = getOrCreateState(params.phoneId);
  const windowStart = now - state.windowMs;

  // prune old events
  state.sends = state.sends.filter((e) => e.timestamp >= windowStart);

  const uniqueRecipients = new Set(state.sends.map((e) => e.to));
  const limit = TIER_LIMITS[state.tier];

  if (!uniqueRecipients.has(params.to) && uniqueRecipients.size >= limit) {
    return {
      allowed: false,
      reason:
        "messaging_limit_reached_for_this_phone_number_in_current_24h_window",
      tier: state.tier,
      windowUniqueRecipients: uniqueRecipients.size,
      limitUniqueRecipients: limit,
    };
  }

  return {
    allowed: true,
    tier: state.tier,
    windowUniqueRecipients: uniqueRecipients.size,
    limitUniqueRecipients: limit,
  };
};

export interface RegisterSendResult {
  event: SendEvent;
  state: MessagingLimitState;
}

export const registerSend = (params: {
  phoneId: string;
  to: string;
  category: ConversationCategory;
  now?: number;
}): RegisterSendResult => {
  const now = params.now ?? Date.now();
  const state = getOrCreateState(params.phoneId);

  const cost = CATEGORY_COST[params.category] ?? CATEGORY_COST.UNKNOWN;
  const event: SendEvent = {
    to: params.to,
    category: params.category,
    timestamp: now,
    costUsd: cost,
  };

  state.sends.push(event);
  state.totalCostUsd += cost;
  states.set(state.phoneId, state);

  return { event, state };
};

export interface MessagingLimitSummary {
  phoneId: string;
  tier: MessagingLimitTier;
  windowMs: number;
  windowUniqueRecipients: number;
  limitUniqueRecipients: number;
  totalCostUsd: number;
}

export const getMessagingSummaryForPhone = (
  phoneId: string,
  now: number = Date.now()
): MessagingLimitSummary => {
  const state = getOrCreateState(phoneId);
  const windowStart = now - state.windowMs;
  const recent = state.sends.filter((e) => e.timestamp >= windowStart);
  const uniqueRecipients = new Set(recent.map((e) => e.to));

  return {
    phoneId,
    tier: state.tier,
    windowMs: state.windowMs,
    windowUniqueRecipients: uniqueRecipients.size,
    limitUniqueRecipients: TIER_LIMITS[state.tier],
    totalCostUsd: state.totalCostUsd,
  };
};

export const listMessagingSummaries = (): MessagingLimitSummary[] => {
  const now = Date.now();
  return Array.from(states.keys()).map((phoneId) =>
    getMessagingSummaryForPhone(phoneId, now)
  );
};

export const listSendEvents = (opts?: {
  phoneId?: string;
  since?: number;
  until?: number;
}): SendEvent[] => {
  const since =
    typeof opts?.since === "number" ? opts.since : Number.NEGATIVE_INFINITY;
  const until =
    typeof opts?.until === "number" ? opts.until : Number.POSITIVE_INFINITY;

  const selectedStates = opts?.phoneId
    ? (() => {
        const state = states.get(opts.phoneId as string);
        return state ? [state] : [];
      })()
    : Array.from(states.values());

  const events: SendEvent[] = [];
  for (const state of selectedStates) {
    for (const event of state.sends) {
      if (event.timestamp < since || event.timestamp > until) continue;
      events.push({ ...event });
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
};

export const setMessagingTier = (phoneId: string, tier: MessagingLimitTier) => {
  const state = getOrCreateState(phoneId);
  state.tier = tier;
  states.set(phoneId, state);
};
