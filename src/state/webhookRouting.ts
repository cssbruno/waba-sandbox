import { getConfig } from "../config";

export interface WabaOverrideConfig {
  wabaId: string;
  overrideCallbackUri?: string;
  verifyToken?: string;
}

export interface PhoneWebhookConfiguration {
  overrideCallbackUri?: string;
  verifyToken?: string;
}

export interface ConversationalCommand {
  command_name: string;
  command_description: string;
}

export interface ConversationalAutomationConfig {
  enable_welcome_message?: boolean;
  commands?: ConversationalCommand[];
  prompts?: string[];
}

export type PhoneQualityRating =
  | "GREEN"
  | "YELLOW"
  | "RED"
  | "UNKNOWN"
  | "NA";

export type PhoneVerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED";

export type PhoneAccountMode = "SANDBOX" | "LIVE";

export interface PendingPhoneVerificationCode {
  code: string;
  method: "SMS" | "VOICE";
  language: string;
  requestedAt: number;
}

export interface PhoneNumberConfig {
  id: string;
  displayPhoneNumber: string;
  wabaId?: string;
  webhookConfiguration?: PhoneWebhookConfiguration;
  verifiedName?: string;
  qualityRating?: PhoneQualityRating;
  verificationStatus: PhoneVerificationStatus;
  pendingVerificationCode?: PendingPhoneVerificationCode;
  twoStepVerificationPin?: string;
  accountMode?: PhoneAccountMode;
  lastOnboardedTime?: number;
  identityKeyCheckEnabled?: boolean;
  registered?: boolean;
  dataLocalizationRegion?: string;
  registerRequests?: number[];
  deregisterRequests?: number[];
  conversationalAutomation?: ConversationalAutomationConfig;
}

const wabas = new Map<string, WabaOverrideConfig>();
const phoneNumbers = new Map<string, PhoneNumberConfig>();

const REQUEST_WINDOW_MS = 72 * 60 * 60 * 1000;
const REQUEST_LIMIT = 10;

const ensureArray = (arr?: number[]): number[] => (arr ? [...arr] : []);

const pruneWindow = (timestamps: number[], now: number): number[] =>
  timestamps.filter((ts) => ts >= now - REQUEST_WINDOW_MS);

export const listWabas = (): WabaOverrideConfig[] =>
  Array.from(wabas.values());

export const upsertWaba = (input: {
  wabaId: string;
  overrideCallbackUri?: string;
  verifyToken?: string;
}): WabaOverrideConfig => {
  const existing = wabas.get(input.wabaId) ?? {
    wabaId: input.wabaId,
  };

  if (input.overrideCallbackUri !== undefined) {
    if (!input.overrideCallbackUri) {
      delete existing.overrideCallbackUri;
    } else {
      existing.overrideCallbackUri = input.overrideCallbackUri;
    }
  }
  if (input.verifyToken !== undefined) {
    if (!input.verifyToken) {
      delete existing.verifyToken;
    } else {
      existing.verifyToken = input.verifyToken;
    }
  }

  wabas.set(existing.wabaId, existing);
  return existing;
};

export const getWaba = (
  wabaId: string
): WabaOverrideConfig | undefined => wabas.get(wabaId);

export const listPhoneNumbers = (): PhoneNumberConfig[] =>
  Array.from(phoneNumbers.values());

export const upsertPhoneNumber = (input: {
  id: string;
  displayPhoneNumber: string;
  wabaId?: string;
  webhookConfiguration?: PhoneWebhookConfiguration;
  verifiedName?: string;
  qualityRating?: PhoneQualityRating;
  accountMode?: PhoneAccountMode;
}): PhoneNumberConfig => {
  let phone = phoneNumbers.get(input.id);

  if (!phone) {
    phone = {
      id: input.id,
      displayPhoneNumber: input.displayPhoneNumber,
      verificationStatus: "UNVERIFIED",
      qualityRating: "NA",
      accountMode: "SANDBOX",
      lastOnboardedTime: Date.now(),
      identityKeyCheckEnabled: false,
      registered: false,
      registerRequests: [],
      deregisterRequests: [],
      conversationalAutomation: {
        enable_welcome_message: false,
        commands: [],
        prompts: [],
      },
    };
  }

  phone.displayPhoneNumber = input.displayPhoneNumber;

  if (input.wabaId !== undefined) {
    phone.wabaId = input.wabaId;
  }
  if (input.webhookConfiguration !== undefined) {
    phone.webhookConfiguration = {
      ...phone.webhookConfiguration,
      ...input.webhookConfiguration,
    };
  }
  if (input.verifiedName !== undefined) {
    phone.verifiedName = input.verifiedName;
  }
  if (input.qualityRating !== undefined) {
    phone.qualityRating = input.qualityRating;
  }
  if (input.accountMode !== undefined) {
    phone.accountMode = input.accountMode;
  }

  phoneNumbers.set(phone.id, phone);
  return phone;
};

export const getPhoneNumber = (
  id: string
): PhoneNumberConfig | undefined => phoneNumbers.get(id);

export const requestPhoneVerificationCode = (params: {
  id: string;
  method: "SMS" | "VOICE";
  language: string;
  codeOverride?: string;
}): PendingPhoneVerificationCode | undefined => {
  const phone = phoneNumbers.get(params.id);
  if (!phone) return undefined;

  const code =
    params.codeOverride ??
    String(Math.floor(100000 + Math.random() * 900000));

  const pending: PendingPhoneVerificationCode = {
    code,
    method: params.method,
    language: params.language,
    requestedAt: Date.now(),
  };

  phone.pendingVerificationCode = pending;
  phone.verificationStatus = "PENDING";
  phoneNumbers.set(phone.id, phone);

  return pending;
};

export const verifyPhoneNumberCode = (params: {
  id: string;
  code: string;
}): boolean => {
  const phone = phoneNumbers.get(params.id);
  if (!phone || !phone.pendingVerificationCode) {
    return false;
  }

  if (phone.pendingVerificationCode.code !== params.code) {
    return false;
  }

  phone.verificationStatus = "VERIFIED";
  delete phone.pendingVerificationCode;
  phoneNumbers.set(phone.id, phone);
  return true;
};

export const setTwoStepVerificationPin = (params: {
  id: string;
  pin: string;
}): string | undefined => {
  const phone = phoneNumbers.get(params.id);
  if (!phone) return undefined;

  phone.twoStepVerificationPin = params.pin;
  phoneNumbers.set(phone.id, phone);
  return params.pin;
};

export interface ResolvedWebhookTarget {
  url: string;
  source: "phone" | "waba" | "app";
  phoneId?: string;
  wabaId?: string;
  appSecret?: string;
}

export const resolveWebhookTarget = (opts: {
  phoneNumberId?: string;
  wabaId?: string;
}): ResolvedWebhookTarget | null => {
  const config = getConfig();

  if (opts.phoneNumberId) {
    const phone = phoneNumbers.get(opts.phoneNumberId);
    if (phone && phone.webhookConfiguration?.overrideCallbackUri) {
      const result: ResolvedWebhookTarget = {
        url: phone.webhookConfiguration.overrideCallbackUri,
        source: "phone",
        phoneId: phone.id,
      };
      if (phone.wabaId) {
        result.wabaId = phone.wabaId;
      }
      return result;
    }
    if (phone?.wabaId) {
      const waba = wabas.get(phone.wabaId);
      if (waba?.overrideCallbackUri) {
        const result: ResolvedWebhookTarget = {
          url: waba.overrideCallbackUri,
          source: "waba",
          phoneId: phone.id,
        };
        if (phone.wabaId) {
          result.wabaId = phone.wabaId;
        }
        return result;
      }
    }
  }

  if (opts.wabaId) {
    const waba = wabas.get(opts.wabaId);
    if (waba?.overrideCallbackUri) {
      return {
        url: waba.overrideCallbackUri,
        source: "waba",
        wabaId: waba.wabaId,
      };
    }
  }

  if (config.targetWebhookUrl) {
    return {
      url: config.targetWebhookUrl,
      source: "app",
      appSecret: config.webhookAppSecret || undefined,
    };
  }

  return null;
};

export const setIdentityKeyCheckForNumber = (params: {
  id: string;
  enableIdentityKeyCheck: boolean;
}): boolean => {
  const phone = phoneNumbers.get(params.id);
  if (!phone) return false;

  phone.identityKeyCheckEnabled = params.enableIdentityKeyCheck;
  phoneNumbers.set(phone.id, phone);
  return true;
};

export const registerPhoneNumber = (params: {
  id: string;
  pin: string;
  dataLocalizationRegion?: string;
  now?: number;
}):
  | { ok: true; phone: PhoneNumberConfig }
  | {
      ok: false;
      error: "not_found" | "rate_limited";
      retryAfterMs?: number;
      attemptsInWindow?: number;
    } => {
  const phone = phoneNumbers.get(params.id);
  if (!phone) return { ok: false, error: "not_found" };

  const now = params.now ?? Date.now();
  const attempts = pruneWindow(ensureArray(phone.registerRequests), now);

  if (attempts.length >= REQUEST_LIMIT) {
    const oldest = Math.min(...attempts);
    phone.registerRequests = attempts;
    phoneNumbers.set(phone.id, phone);
    return {
      ok: false,
      error: "rate_limited",
      retryAfterMs: Math.max(0, oldest + REQUEST_WINDOW_MS - now),
      attemptsInWindow: attempts.length,
    };
  }

  attempts.push(now);
  phone.registerRequests = attempts;
  phone.twoStepVerificationPin = params.pin;
  phone.registered = true;
  if (params.dataLocalizationRegion) {
    phone.dataLocalizationRegion = params.dataLocalizationRegion.toUpperCase();
  } else {
    delete phone.dataLocalizationRegion;
  }
  phoneNumbers.set(phone.id, phone);

  return { ok: true, phone };
};

export const deregisterPhoneNumber = (params: {
  id: string;
  now?: number;
}):
  | { ok: true; phone: PhoneNumberConfig }
  | {
      ok: false;
      error: "not_found" | "rate_limited";
      retryAfterMs?: number;
      attemptsInWindow?: number;
    } => {
  const phone = phoneNumbers.get(params.id);
  if (!phone) return { ok: false, error: "not_found" };

  const now = params.now ?? Date.now();
  const attempts = pruneWindow(ensureArray(phone.deregisterRequests), now);

  if (attempts.length >= REQUEST_LIMIT) {
    const oldest = Math.min(...attempts);
    phone.deregisterRequests = attempts;
    phoneNumbers.set(phone.id, phone);
    return {
      ok: false,
      error: "rate_limited",
      retryAfterMs: Math.max(0, oldest + REQUEST_WINDOW_MS - now),
      attemptsInWindow: attempts.length,
    };
  }

  attempts.push(now);
  phone.deregisterRequests = attempts;
  phone.registered = false;
  delete phone.dataLocalizationRegion;
  phoneNumbers.set(phone.id, phone);

  return { ok: true, phone };
};

export const getConversationalAutomation = (
  id: string
): ConversationalAutomationConfig | undefined => {
  const phone = phoneNumbers.get(id);
  if (!phone) return undefined;
  if (!phone.conversationalAutomation) {
    phone.conversationalAutomation = {
      enable_welcome_message: false,
      commands: [],
      prompts: [],
    };
    phoneNumbers.set(phone.id, phone);
  }
  return phone.conversationalAutomation;
};

export const updateConversationalAutomation = (params: {
  id: string;
  enableWelcomeMessage?: boolean;
  commands?: ConversationalCommand[];
  prompts?: string[];
}): ConversationalAutomationConfig | undefined => {
  const phone = phoneNumbers.get(params.id);
  if (!phone) return undefined;

  const current = getConversationalAutomation(params.id) ?? {
    enable_welcome_message: false,
    commands: [],
    prompts: [],
  };

  if (typeof params.enableWelcomeMessage === "boolean") {
    current.enable_welcome_message = params.enableWelcomeMessage;
  }

  if (params.commands !== undefined) {
    current.commands = params.commands;
  }

  if (params.prompts !== undefined) {
    current.prompts = params.prompts;
  }

  phone.conversationalAutomation = current;
  phoneNumbers.set(phone.id, phone);
  return current;
};
