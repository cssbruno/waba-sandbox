export type ContactStatus = "allowed" | "blocked" | "unknown";

export interface ContactPolicy {
  waId: string;
  label?: string;
  status: ContactStatus;
  note?: string;
  updatedAt: number;
}

export interface PolicyEvaluation {
  waId: string;
  status: ContactStatus;
  allowed: boolean;
  reason?: string;
  contact?: ContactPolicy;
}

const contacts = new Map<string, ContactPolicy>();

export const listContactPolicies = (): ContactPolicy[] =>
  Array.from(contacts.values());

export const getContactPolicy = (waId: string): ContactPolicy | undefined =>
  contacts.get(waId);

export const upsertContactPolicy = (input: {
  waId: string;
  label?: string;
  status?: ContactStatus;
  note?: string;
}): ContactPolicy => {
  const now = Date.now();
  const existing = contacts.get(input.waId);
  const status: ContactStatus =
    input.status || existing?.status || "unknown";
  const policy: ContactPolicy = {
    waId: input.waId,
    status,
    updatedAt: now,
  };

  const label = input.label ?? existing?.label;
  if (label !== undefined) {
    policy.label = label;
  }

  const note = input.note ?? existing?.note;
  if (note !== undefined) {
    policy.note = note;
  }

  contacts.set(input.waId, policy);
  return policy;
};

export const evaluatePolicyForWaId = (waId: string): PolicyEvaluation => {
  const contact = contacts.get(waId);
  if (!contact) {
    return {
      waId,
      status: "unknown",
      allowed: true,
      reason: "no_explicit_policy",
    };
  }

  if (contact.status === "blocked") {
    return {
      waId,
      status: contact.status,
      allowed: false,
      reason:
        "contact_marked_as_blocked_in_sandbox_policy__check_EULA_and_opt_in_requirements",
      contact,
    };
  }

  if (contact.status === "allowed") {
    return {
      waId,
      status: contact.status,
      allowed: true,
      reason: "contact_marked_as_allowed_in_sandbox_policy",
      contact,
    };
  }

  return {
    waId,
    status: contact.status,
    allowed: true,
    reason: "contact_policy_unknown__treat_as_allowed_but_review_for_EULA",
    contact,
  };
};
