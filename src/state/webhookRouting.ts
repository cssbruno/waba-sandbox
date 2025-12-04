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

export interface PhoneNumberConfig {
  id: string;
  displayPhoneNumber: string;
  wabaId?: string;
  webhookConfiguration?: PhoneWebhookConfiguration;
}

const wabas = new Map<string, WabaOverrideConfig>();
const phoneNumbers = new Map<string, PhoneNumberConfig>();

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
}): PhoneNumberConfig => {
  const existing = phoneNumbers.get(input.id) ?? {
    id: input.id,
    displayPhoneNumber: input.displayPhoneNumber,
  };

  existing.displayPhoneNumber = input.displayPhoneNumber;
  if (input.wabaId !== undefined) {
    existing.wabaId = input.wabaId;
  }
  if (input.webhookConfiguration !== undefined) {
    existing.webhookConfiguration = {
      ...existing.webhookConfiguration,
      ...input.webhookConfiguration,
    };
  }

  phoneNumbers.set(existing.id, existing);
  return existing;
};

export const getPhoneNumber = (
  id: string
): PhoneNumberConfig | undefined => phoneNumbers.get(id);

export interface ResolvedWebhookTarget {
  url: string;
  source: "phone" | "waba" | "app";
  phoneId?: string;
  wabaId?: string;
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
    };
  }

  return null;
};
