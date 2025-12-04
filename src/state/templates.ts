export type TemplateCategory =
  | "MARKETING"
  | "UTILITY"
  | "AUTHENTICATION"
  | "UNKNOWN";

export type TemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "IN_APPEAL"
  | "DISABLED"
  | "PAUSED";

export type TemplateRejectionReason =
  | "POLICY"
  | "SPAM"
  | "TRADEMARK"
  | "INCORRECT_FORMAT"
  | "PROHIBITED_CONTENT"
  | "OTHER";

export type TemplateButtonType =
  | "QUICK_REPLY"
  | "URL"
  | "PHONE_NUMBER"
  | "COPY_CODE";

export interface TemplateButton {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface TemplateComponentExample {
  header_text?: string[];
  body_text?: Array<string> | Array<Array<string>>;
  footer_text?: string[];
  button_text?: Array<Array<string>>;
  [key: string]: unknown;
}

export type TemplateComponentType =
  | "HEADER"
  | "BODY"
  | "FOOTER"
  | "BUTTONS";

export interface TemplateComponent {
  type: TemplateComponentType;
  format?: string;
  text?: string;
  example?: TemplateComponentExample;
  buttons?: TemplateButton[];
}

export interface TemplateStatusAudit {
  status: TemplateStatus;
  reason?: TemplateRejectionReason | undefined;
  note?: string | undefined;
  updatedAt: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  languageCode: string;
  category: TemplateCategory;
  bodyText?: string | undefined;
  headerText?: string | undefined;
  footerText?: string | undefined;
  components: TemplateComponent[];
  /**
   * Optional WABA ID this template belongs to, to simulate
   * /<WABA_ID>/message_templates semantics.
   */
  wabaId?: string;
  status: TemplateStatus;
  statusHistory: TemplateStatusAudit[];
  rejectionReason?: TemplateRejectionReason | undefined;
  rejectionNote?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export const normalizeTemplateCategory = (
  category: unknown
): TemplateCategory => {
  if (typeof category !== "string") {
    return "UNKNOWN";
  }

  const upper = category.toUpperCase();
  if (upper === "MARKETING" || upper === "UTILITY" || upper === "AUTHENTICATION") {
    return upper;
  }

  if (upper === "UNKNOWN") {
    return "UNKNOWN";
  }

  return "UNKNOWN";
};

export const normalizeTemplateStatus = (
  status: unknown,
  defaultStatus: TemplateStatus = "PENDING"
): TemplateStatus => {
  if (typeof status !== "string") {
    return defaultStatus;
  }
  const upper = status.toUpperCase();
  if (
    upper === "APPROVED" ||
    upper === "PENDING" ||
    upper === "REJECTED" ||
    upper === "IN_APPEAL" ||
    upper === "DISABLED" ||
    upper === "PAUSED"
  ) {
    return upper;
  }
  return defaultStatus;
};

export const normalizeTemplateRejectionReason = (
  reason: unknown
): TemplateRejectionReason | undefined => {
  if (typeof reason !== "string") return undefined;
  const upper = reason.toUpperCase();
  if (
    upper === "POLICY" ||
    upper === "SPAM" ||
    upper === "TRADEMARK" ||
    upper === "INCORRECT_FORMAT" ||
    upper === "PROHIBITED_CONTENT" ||
    upper === "OTHER"
  ) {
    return upper;
  }
  return "OTHER";
};

const templates = new Map<string, MessageTemplate>();

const buildComponentsFromText = (
  bodyText?: string,
  headerText?: string,
  footerText?: string
): TemplateComponent[] => {
  const components: TemplateComponent[] = [];
  if (headerText) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: headerText,
    });
  }
  if (bodyText) {
    components.push({
      type: "BODY",
      text: bodyText,
    });
  }
  if (footerText) {
    components.push({
      type: "FOOTER",
      text: footerText,
    });
  }
  return components;
};

const deriveTextFromComponents = (
  components?: TemplateComponent[]
): {
  headerText?: string;
  bodyText?: string;
  footerText?: string;
} => {
  const result: {
    headerText?: string;
    bodyText?: string;
    footerText?: string;
  } = {};
  if (!components) return result;

  for (const component of components) {
    if (component.type === "HEADER" && component.text && !result.headerText) {
      result.headerText = component.text;
    } else if (
      component.type === "BODY" &&
      component.text &&
      !result.bodyText
    ) {
      result.bodyText = component.text;
    } else if (
      component.type === "FOOTER" &&
      component.text &&
      !result.footerText
    ) {
      result.footerText = component.text;
    }
  }

  return result;
};

const ensureTemplateShape = (tpl: MessageTemplate): MessageTemplate => {
  const next = tpl;

  if (!Array.isArray(next.components) || next.components.length === 0) {
    next.components = buildComponentsFromText(
      next.bodyText,
      next.headerText,
      next.footerText
    );
  }

  const derived = deriveTextFromComponents(next.components);
  if (!next.bodyText && derived.bodyText) {
    next.bodyText = derived.bodyText;
  }
  if (!next.headerText && derived.headerText) {
    next.headerText = derived.headerText;
  }
  if (!next.footerText && derived.footerText) {
    next.footerText = derived.footerText;
  }

  if (!next.statusHistory || next.statusHistory.length === 0) {
    const audit: TemplateStatusAudit = {
      status: next.status ?? "PENDING",
      updatedAt: next.updatedAt ?? Date.now(),
    };
    if (next.rejectionReason !== undefined) {
      audit.reason = next.rejectionReason;
    }
    next.statusHistory = [audit];
  }

  if (!next.createdAt) {
    next.createdAt = Date.now();
  }
  if (!next.updatedAt) {
    next.updatedAt = next.createdAt;
  }

  templates.set(next.id, next);
  return next;
};

export const listTemplates = (): MessageTemplate[] =>
  Array.from(templates.values()).map(ensureTemplateShape);

export const getTemplateById = (
  id: string
): MessageTemplate | undefined => {
  const tpl = templates.get(id);
  if (!tpl) return undefined;
  return ensureTemplateShape(tpl);
};

export const getTemplateByName = (
  name: string,
  languageCode?: string,
  wabaId?: string
): MessageTemplate | undefined => {
  const normalizedName = name.toLowerCase();
  const normalizedLang = languageCode?.toLowerCase();
  const normalizedWaba = wabaId?.toLowerCase();
  return listTemplates().find((tpl) => {
    if (tpl.name.toLowerCase() !== normalizedName) return false;
    if (normalizedLang) {
      if (tpl.languageCode.toLowerCase() !== normalizedLang) return false;
    }
    if (normalizedWaba) {
      if (!tpl.wabaId) return false;
      if (tpl.wabaId.toLowerCase() !== normalizedWaba) return false;
    }
    return true;
  });
};

export const createTemplate = (input: {
  name: string;
  languageCode: string;
  category?: TemplateCategory;
  bodyText?: string;
  headerText?: string;
  footerText?: string;
  components?: TemplateComponent[];
  wabaId?: string;
  status?: TemplateStatus;
  rejectionReason?: TemplateRejectionReason;
  rejectionNote?: string;
}): MessageTemplate => {
  const id = `tpl_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const status = normalizeTemplateStatus(input.status);
  const now = Date.now();

  const derivedComponents =
    input.components ??
    buildComponentsFromText(input.bodyText, input.headerText, input.footerText);
  const derivedText = deriveTextFromComponents(derivedComponents);
  const bodyText = input.bodyText ?? derivedText.bodyText;

  if (!bodyText) {
    throw new Error("body_text_required");
  }

  const rejectionReason =
    status === "REJECTED"
      ? input.rejectionReason ?? "POLICY"
      : input.rejectionReason;

  const statusAudit: TemplateStatusAudit = {
    status,
    updatedAt: now,
  };
  if (rejectionReason !== undefined) {
    statusAudit.reason = rejectionReason;
  }
  if (input.rejectionNote !== undefined) {
    statusAudit.note = input.rejectionNote;
  }

  const template: MessageTemplate = {
    id,
    name: input.name,
    languageCode: input.languageCode,
    category: input.category ?? "UNKNOWN",
    bodyText,
    headerText: input.headerText ?? derivedText.headerText,
    footerText: input.footerText ?? derivedText.footerText,
    components: derivedComponents,
    status,
    statusHistory: [statusAudit],
    rejectionReason,
    rejectionNote: input.rejectionNote,
    createdAt: now,
    updatedAt: now,
  };

  if (input.wabaId !== undefined) {
    template.wabaId = input.wabaId;
  }

  templates.set(id, template);
  return template;
};

export const updateTemplate = (
  id: string,
  patch: Partial<{
    name: string;
    languageCode: string;
    category: TemplateCategory;
    bodyText: string;
    headerText: string | null;
    footerText: string | null;
    wabaId: string | null;
    status: TemplateStatus;
    components: TemplateComponent[];
    rejectionReason: TemplateRejectionReason | null;
    rejectionNote: string | null;
    statusNote: string | null;
  }>
): MessageTemplate | undefined => {
  const existing = templates.get(id);
  if (!existing) return undefined;
  ensureTemplateShape(existing);

  if (typeof patch.name === "string") {
    existing.name = patch.name;
  }
  if (typeof patch.languageCode === "string") {
    existing.languageCode = patch.languageCode;
  }
  if (patch.category) {
    existing.category = patch.category;
  }
  if (typeof patch.bodyText === "string") {
    existing.bodyText = patch.bodyText;
  }
  if (patch.headerText === null) {
    delete existing.headerText;
  } else if (typeof patch.headerText === "string") {
    existing.headerText = patch.headerText;
  }
  if (patch.footerText === null) {
    delete existing.footerText;
  } else if (typeof patch.footerText === "string") {
    existing.footerText = patch.footerText;
  }
  if (patch.status) {
    const normalized = normalizeTemplateStatus(patch.status, existing.status);
    existing.status = normalized;
    const rejectionReason =
      normalized === "REJECTED"
        ? patch.rejectionReason ?? existing.rejectionReason ?? "POLICY"
        : patch.rejectionReason ?? existing.rejectionReason;
    if (rejectionReason !== undefined) {
      existing.rejectionReason = rejectionReason;
    } else {
      delete existing.rejectionReason;
    }
    if (patch.rejectionNote !== null && patch.rejectionNote !== undefined) {
      existing.rejectionNote = patch.rejectionNote || undefined;
    }
    const historyNote =
      patch.statusNote ?? patch.rejectionNote ?? existing.rejectionNote;
    const historyEntry: TemplateStatusAudit = {
      status: normalized,
      updatedAt: Date.now(),
    };
    if (rejectionReason !== undefined) {
      historyEntry.reason = rejectionReason;
    }
    if (historyNote !== undefined) {
      historyEntry.note = historyNote;
    }
    existing.statusHistory = [...(existing.statusHistory ?? []), historyEntry];
  }
  if (patch.wabaId === null) {
    delete existing.wabaId;
  } else if (typeof patch.wabaId === "string") {
    existing.wabaId = patch.wabaId;
  }
  if (Array.isArray(patch.components)) {
    existing.components = patch.components;
    const derived = deriveTextFromComponents(patch.components);
    if (derived.bodyText) {
      existing.bodyText = derived.bodyText;
    }
    if (derived.headerText) {
      existing.headerText = derived.headerText;
    }
    if (derived.footerText) {
      existing.footerText = derived.footerText;
    }
  }
  if (patch.rejectionReason === null) {
    delete existing.rejectionReason;
  } else if (patch.rejectionReason) {
    existing.rejectionReason = patch.rejectionReason;
  }
  if (patch.rejectionNote === null) {
    delete existing.rejectionNote;
  } else if (typeof patch.rejectionNote === "string") {
    existing.rejectionNote = patch.rejectionNote;
  }

  existing.updatedAt = Date.now();
  templates.set(id, existing);
  return existing;
};

export const updateTemplateStatus = (
  id: string,
  status: TemplateStatus,
  opts?: {
    rejectionReason?: TemplateRejectionReason;
    rejectionNote?: string;
  }
): MessageTemplate | undefined => {
  const patch: Partial<{
    status: TemplateStatus;
    rejectionReason: TemplateRejectionReason | null;
    rejectionNote: string | null;
    statusNote: string | null;
  }> = { status };

  if (opts?.rejectionReason !== undefined) {
    patch.rejectionReason = opts.rejectionReason;
  }
  if (opts?.rejectionNote !== undefined) {
    patch.rejectionNote = opts.rejectionNote;
    patch.statusNote = opts.rejectionNote;
  }

  return updateTemplate(id, patch);
};

export const deleteTemplate = (id: string): boolean =>
  templates.delete(id);
