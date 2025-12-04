import { TemplateCategory } from "./templates";

export type MarketingOptInStatus = "opted_in" | "opted_out" | "unknown";

export interface MarketingContact {
  waId: string;
  status: MarketingOptInStatus;
  source?: string;
  note?: string;
  updatedAt: number;
}

export interface MarketingEligibility {
  waId: string;
  status: MarketingOptInStatus;
  allowed: boolean;
  reason: string;
  contact?: MarketingContact;
}

export interface MarketingSendRecord {
  id: string;
  phoneId: string;
  to: string;
  templateName?: string;
  languageCode?: string;
  category: TemplateCategory;
  sendTimestamp: number;
  scheduledFor?: number;
}

export interface MarketingConversionEvent {
  id: string;
  waId: string;
  sendId?: string;
  event: string;
  value?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface MarketingFrequencyEvaluation {
  allowed: boolean;
  reason?: string;
  windowMs: number;
  sendsInWindow: number;
  maxSends: number;
}

export interface MarketingConfigState {
  frequencyWindowMs: number;
  maxSendsPerWindow: number;
  requireOptIn: boolean;
}

const contacts = new Map<string, MarketingContact>();
const sends: MarketingSendRecord[] = [];
const conversions: MarketingConversionEvent[] = [];

const frequencyBuckets = new Map<string, MarketingSendRecord[]>();

const config: MarketingConfigState = {
  frequencyWindowMs: 24 * 60 * 60 * 1000, // 24h rolling window
  maxSendsPerWindow: 1, // one marketing blast per recipient per window
  requireOptIn: true,
};

const getFrequencyKey = (phoneId: string, to: string): string =>
  `${phoneId}__${to}`;

const clampPositive = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  if (value <= 0) return fallback;
  return value;
};

export const listMarketingContacts = (): MarketingContact[] =>
  Array.from(contacts.values());

export const upsertMarketingContact = (input: {
  waId: string;
  status?: MarketingOptInStatus;
  source?: string;
  note?: string;
}): MarketingContact => {
  const now = Date.now();
  const existing = contacts.get(input.waId);
  const status: MarketingOptInStatus =
    input.status ?? existing?.status ?? "unknown";

  const contact: MarketingContact = {
    waId: input.waId,
    status,
    updatedAt: now,
  };

  const source = input.source ?? existing?.source;
  if (source !== undefined) {
    contact.source = source;
  }

  const note = input.note ?? existing?.note;
  if (note !== undefined) {
    contact.note = note;
  }

  contacts.set(input.waId, contact);
  return contact;
};

export const evaluateMarketingEligibility = (
  waId: string
): MarketingEligibility => {
  const contact = contacts.get(waId);
  if (!contact) {
    return {
      waId,
      status: "unknown",
      allowed: !config.requireOptIn,
      reason: config.requireOptIn
        ? "marketing_opt_in_required"
        : "no_marketing_opt_status__treated_as_allowed",
    };
  }

  if (contact.status === "opted_out") {
    return {
      waId,
      status: contact.status,
      allowed: false,
      reason: "contact_opted_out_of_marketing_messages",
      contact,
    };
  }

  if (contact.status === "opted_in") {
    return {
      waId,
      status: contact.status,
      allowed: true,
      reason: "contact_opted_in_for_marketing_messages",
      contact,
    };
  }

  return {
    waId,
    status: contact.status,
    allowed: !config.requireOptIn,
    reason: config.requireOptIn
      ? "marketing_opt_in_required"
      : "contact_marketing_status_unknown__treated_as_allowed",
    contact,
  };
};

export const evaluateMarketingFrequency = (params: {
  phoneId: string;
  to: string;
  now?: number;
}): MarketingFrequencyEvaluation => {
  const now = params.now ?? Date.now();
  const key = getFrequencyKey(params.phoneId, params.to);
  const windowStart = now - config.frequencyWindowMs;
  const history = frequencyBuckets.get(key) ?? [];
  const recent = history.filter((s) => {
    const at = s.scheduledFor ?? s.sendTimestamp;
    return at >= windowStart;
  });

  const allowed = recent.length < config.maxSendsPerWindow;

  return {
    allowed,
    reason: allowed ? "within_frequency_cap" : "marketing_frequency_cap_hit",
    windowMs: config.frequencyWindowMs,
    sendsInWindow: recent.length,
    maxSends: config.maxSendsPerWindow,
  };
};

export const registerMarketingSend = (params: {
  phoneId: string;
  to: string;
  templateName?: string;
  languageCode?: string;
  category?: TemplateCategory;
  sendAt?: number;
}): MarketingSendRecord => {
  const now = Date.now();
  const effectiveSend = params.sendAt ?? now;
  const record: MarketingSendRecord = {
    id: `mkt_${now}_${Math.random().toString(36).slice(2, 8)}`,
    phoneId: params.phoneId,
    to: params.to,
    category: params.category ?? "MARKETING",
    sendTimestamp: now,
  };

  if (params.templateName !== undefined) {
    record.templateName = params.templateName;
  }
  if (params.languageCode !== undefined) {
    record.languageCode = params.languageCode;
  }
  if (params.sendAt !== undefined) {
    record.scheduledFor = params.sendAt;
  }

  sends.push(record);
  if (sends.length > 500) {
    sends.splice(0, sends.length - 500);
  }

  const key = getFrequencyKey(params.phoneId, params.to);
  const existing = frequencyBuckets.get(key) ?? [];
  existing.push(record);
  const cutoff = effectiveSend - config.frequencyWindowMs;
  const pruned = existing.filter((r) => {
    const at = r.scheduledFor ?? r.sendTimestamp;
    return at >= cutoff;
  });
  frequencyBuckets.set(key, pruned);

  return record;
};

export const listMarketingSends = (): MarketingSendRecord[] =>
  [...sends].sort((a, b) => b.sendTimestamp - a.sendTimestamp);

export const recordMarketingConversion = (params: {
  waId: string;
  sendId?: string;
  event: string;
  value?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}): MarketingConversionEvent => {
  const event: MarketingConversionEvent = {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    waId: params.waId,
    event: params.event,
    createdAt: Date.now(),
  };

  if (params.sendId !== undefined) {
    event.sendId = params.sendId;
  }
  if (params.value !== undefined) {
    event.value = params.value;
  }
  if (params.currency !== undefined) {
    event.currency = params.currency;
  }
  if (params.metadata !== undefined) {
    event.metadata = params.metadata;
  }

  conversions.push(event);
  if (conversions.length > 500) {
    conversions.splice(0, conversions.length - 500);
  }

  return event;
};

export const listMarketingConversions = (): MarketingConversionEvent[] =>
  [...conversions].sort((a, b) => b.createdAt - a.createdAt);

export const getMarketingConfig = (): MarketingConfigState => ({ ...config });

export const updateMarketingConfig = (patch: Partial<MarketingConfigState>) => {
  if (typeof patch.frequencyWindowMs === "number") {
    config.frequencyWindowMs = clampPositive(
      patch.frequencyWindowMs,
      config.frequencyWindowMs
    );
  }

  if (typeof patch.maxSendsPerWindow === "number") {
    config.maxSendsPerWindow = Math.max(
      1,
      Math.floor(patch.maxSendsPerWindow)
    );
  }

  if (typeof patch.requireOptIn === "boolean") {
    config.requireOptIn = patch.requireOptIn;
  }
};
