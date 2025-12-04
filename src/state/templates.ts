export type TemplateCategory =
  | "MARKETING"
  | "UTILITY"
  | "AUTHENTICATION"
  | "UNKNOWN";

export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED";

export interface MessageTemplate {
  id: string;
  name: string;
  languageCode: string;
  category: TemplateCategory;
  bodyText: string;
  headerText?: string;
  footerText?: string;
  /**
   * Optional WABA ID this template belongs to, to simulate
   * /<WABA_ID>/message_templates semantics.
   */
  wabaId?: string;
  status: TemplateStatus;
  createdAt: number;
  updatedAt: number;
}

const templates = new Map<string, MessageTemplate>();

export const listTemplates = (): MessageTemplate[] =>
  Array.from(templates.values());

export const getTemplateById = (
  id: string
): MessageTemplate | undefined => templates.get(id);

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
  bodyText: string;
  headerText?: string;
  footerText?: string;
  wabaId?: string;
  status?: TemplateStatus;
}): MessageTemplate => {
  const id = `tpl_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const now = Date.now();
  const template: MessageTemplate = {
    id,
    name: input.name,
    languageCode: input.languageCode,
    category: input.category ?? "UNKNOWN",
    bodyText: input.bodyText,
    status: input.status ?? "APPROVED",
    createdAt: now,
    updatedAt: now,
  };

  if (input.headerText !== undefined) {
    template.headerText = input.headerText;
  }
  if (input.footerText !== undefined) {
    template.footerText = input.footerText;
  }
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
  }>
): MessageTemplate | undefined => {
  const existing = templates.get(id);
  if (!existing) return undefined;

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
    existing.status = patch.status;
  }
  if (patch.wabaId === null) {
    delete existing.wabaId;
  } else if (typeof patch.wabaId === "string") {
    existing.wabaId = patch.wabaId;
  }

  existing.updatedAt = Date.now();
  templates.set(id, existing);
  return existing;
};

export const deleteTemplate = (id: string): boolean =>
  templates.delete(id);
