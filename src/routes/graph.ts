import { Router, Request, Response } from "express";
import {
  getPhoneNumber,
  getWaba,
  listPhoneNumbers,
  registerPhoneNumber,
  requestPhoneVerificationCode,
  deregisterPhoneNumber,
  setIdentityKeyCheckForNumber,
  setTwoStepVerificationPin,
  upsertPhoneNumber,
  upsertWaba,
  verifyPhoneNumberCode,
  getConversationalAutomation,
  updateConversationalAutomation,
} from "../state/webhookRouting";
import {
  ConversationCategory,
  evaluateMessagingLimit,
  getMessagingSummaryForPhone,
  listSendEvents,
  registerSend,
} from "../state/messagingLimits";
import {
  evaluateMarketingEligibility,
  evaluateMarketingFrequency,
  listMarketingConversions,
  listMarketingSends,
  registerMarketingSend,
} from "../state/marketing";
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  getTemplateByName,
  listTemplates,
  MessageTemplate,
  normalizeTemplateCategory,
  normalizeTemplateRejectionReason,
  normalizeTemplateStatus,
  TemplateCategory,
  TemplateComponent,
  TemplateButton,
  TemplateButtonType,
  TemplateRejectionReason,
  updateTemplateStatus,
} from "../state/templates";
import {
  getBusinessProfile,
  upsertBusinessProfile,
} from "../state/businessProfile";
import { evaluatePolicyForWaId } from "../state/policy";
import { addEvent } from "../state/eventStore";

export const createGraphRouter = (): Router => {
  const router = Router({ mergeParams: true });

  const parseFieldsParam = (value: unknown): string[] => {
    if (typeof value !== "string") return [];
    return value
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  };

  const parseListParam = (value: unknown): string[] => {
    if (typeof value !== "string") return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => (typeof v === "string" ? v : String(v)))
          .filter(Boolean);
      }
    } catch {
      // ignore JSON parse failures, fall back to comma separated handling
    }
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const parseLimit = (
    value: unknown,
    defaultValue = 25,
    max = 100
  ): number => {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
        ? parseInt(value, 10)
        : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, max);
    }
    return defaultValue;
  };

  const parseTimeMs = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 10_000_000_000 ? value * 1000 : value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
      }
      const parsedDate = Date.parse(value);
      if (!Number.isNaN(parsedDate)) {
        return parsedDate;
      }
    }
    return undefined;
  };

  const sanitizeExample = (raw: any): Record<string, unknown> => {
    const example: Record<string, unknown> = {};
    if (!raw || typeof raw !== "object") return example;

    if (Array.isArray(raw.header_text)) {
      const header = raw.header_text.filter(
        (h: unknown): h is string => typeof h === "string"
      );
      if (header.length > 0) {
        example.header_text = header;
      }
    }
    if (Array.isArray(raw.body_text)) {
      const bodyText = raw.body_text
        .map((item: unknown) => {
          if (Array.isArray(item)) {
            return item.filter(
              (entry: unknown): entry is string => typeof entry === "string"
            );
          }
          if (typeof item === "string") return item;
          return undefined;
        })
        .filter(Boolean);
      if (bodyText.length > 0) {
        example.body_text = bodyText;
      }
    }
    if (Array.isArray(raw.footer_text)) {
      const footer = raw.footer_text.filter(
        (f: unknown): f is string => typeof f === "string"
      );
      if (footer.length > 0) {
        example.footer_text = footer;
      }
    }
    if (Array.isArray(raw.button_text)) {
      const buttonText = raw.button_text
        .map((row: unknown) => {
          if (!Array.isArray(row)) return undefined;
          const cleaned = row.filter(
            (entry: unknown): entry is string => typeof entry === "string"
          );
          return cleaned.length > 0 ? cleaned : undefined;
        })
        .filter(Boolean);
      if (buttonText.length > 0) {
        example.button_text = buttonText;
      }
    }

    return example;
  };

  const sanitizeButtonType = (
    type: unknown
  ): TemplateButtonType | undefined => {
    if (typeof type !== "string") return undefined;
    const upper = type.toUpperCase();
    if (
      upper === "QUICK_REPLY" ||
      upper === "URL" ||
      upper === "PHONE_NUMBER" ||
      upper === "COPY_CODE"
    ) {
      return upper;
    }
    return undefined;
  };

  const sanitizeButton = (raw: any): TemplateButton | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const buttonType = sanitizeButtonType((raw as any).type);
    const text =
      typeof (raw as any).text === "string" ? (raw as any).text : undefined;

    if (!buttonType || !text) return undefined;

    const button: TemplateButton = {
      type: buttonType,
      text,
    };

    if (buttonType === "URL" && typeof (raw as any).url === "string") {
      button.url = (raw as any).url;
    }
    if (
      buttonType === "PHONE_NUMBER" &&
      typeof (raw as any).phone_number === "string"
    ) {
      button.phone_number = (raw as any).phone_number;
    }
    if (Array.isArray((raw as any).example)) {
      const example = (raw as any).example.filter(
        (ex: unknown): ex is string => typeof ex === "string"
      );
      if (example.length > 0) {
        button.example = example;
      }
    }

    return button;
  };

  const sanitizeComponent = (raw: any): TemplateComponent | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    if (typeof (raw as any).type !== "string") return undefined;

    const type = (raw as any).type.toUpperCase();
    if (
      type !== "HEADER" &&
      type !== "BODY" &&
      type !== "FOOTER" &&
      type !== "BUTTONS"
    ) {
      return undefined;
    }

    const component: TemplateComponent = {
      type,
    };

    if (typeof (raw as any).format === "string") {
      component.format = (raw as any).format.toUpperCase();
    }
    if (typeof (raw as any).text === "string") {
      component.text = (raw as any).text;
    }
    if ((raw as any).example && typeof (raw as any).example === "object") {
      const example = sanitizeExample((raw as any).example);
      if (Object.keys(example).length > 0) {
        component.example = example;
      }
    }
    if (type === "BUTTONS" && Array.isArray((raw as any).buttons)) {
      const buttons = (raw as any).buttons
        .map(sanitizeButton)
        .filter(
          (
            button: TemplateButton | undefined
          ): button is TemplateButton => Boolean(button)
        );
      if (buttons.length > 0) {
        component.buttons = buttons;
      }
    }

    return component;
  };

  const sanitizeComponentsInput = (
    input: unknown
  ): TemplateComponent[] => {
    if (!Array.isArray(input)) return [];
    return input
      .map(sanitizeComponent)
      .filter(
        (c): c is NonNullable<ReturnType<typeof sanitizeComponent>> =>
          Boolean(c)
      );
  };

  const extractTextFromComponents = (
    components: TemplateComponent[]
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
    for (const component of components) {
      if (component.type === "HEADER" && component.text && !result.headerText) {
        result.headerText = component.text;
      }
      if (component.type === "BODY" && component.text && !result.bodyText) {
        result.bodyText = component.text;
      }
      if (component.type === "FOOTER" && component.text && !result.footerText) {
        result.footerText = component.text;
      }
    }
    return result;
  };

  const toGraphTemplate = (
    tpl: MessageTemplate,
    fields?: string[]
  ): Record<string, unknown> => {
    const requestedFields = Array.isArray(fields) ? fields : [];
    const hasRequested = requestedFields.length > 0;
    const includeField = (field: string): boolean =>
      !hasRequested || requestedFields.includes(field);

    const graphComponents = (tpl.components ?? []).map((component) => {
      const graphComponent: Record<string, unknown> = {
        type: component.type,
      };
      if (component.format) {
        graphComponent.format = component.format;
      }
      if (component.text) {
        graphComponent.text = component.text;
      }
      if (component.example) {
        graphComponent.example = component.example;
      }
      if (component.type === "BUTTONS" && component.buttons) {
        graphComponent.buttons = component.buttons.map((btn) => {
          const result: Record<string, unknown> = {
            type: btn.type,
            text: btn.text,
          };
          if (btn.url) result.url = btn.url;
          if (btn.phone_number) result.phone_number = btn.phone_number;
          if (btn.example && btn.example.length > 0) {
            result.example = btn.example;
          }
          return result;
        });
      }
      return graphComponent;
    });

    const payload: Record<string, unknown> = {
      id: tpl.id,
    };

    if (includeField("name")) payload.name = tpl.name;
    if (includeField("language")) payload.language = tpl.languageCode;
    if (includeField("category")) payload.category = tpl.category;
    if (includeField("status")) payload.status = tpl.status;
    if (includeField("rejection_reason")) {
      payload.rejection_reason = tpl.rejectionReason ?? null;
    }
    if (includeField("components")) payload.components = graphComponents;
    if (includeField("quality_score")) {
      payload.quality_score = { score: "UNKNOWN" };
    }
    if (includeField("last_updated_time")) {
      payload.last_updated_time = tpl.updatedAt;
    }
    if (includeField("status_history")) {
      payload.status_history = tpl.statusHistory;
    }

    payload.sandbox = {
      waba_id: tpl.wabaId ?? null,
      status_history: tpl.statusHistory,
      rejection_note: tpl.rejectionNote ?? null,
    };

    return payload;
  };

  const paginateTemplates = (params: {
    templates: MessageTemplate[];
    limit: number;
    after?: string;
    before?: string;
  }): {
    slice: MessageTemplate[];
    paging: Record<string, unknown>;
    total: number;
  } => {
    const { templates, limit, after, before } = params;
    const total = templates.length;
    let start = 0;
    let end = total;

    if (after) {
      const index = templates.findIndex((tpl) => tpl.id === after);
      if (index >= 0) {
        start = index + 1;
      }
    }
    if (before) {
      const index = templates.findIndex((tpl) => tpl.id === before);
      if (index >= 0) {
        end = index;
      }
    }

    const slice = templates.slice(start, Math.min(end, start + limit));
    const lastIndex = start + slice.length - 1;
    const nextItem =
      lastIndex >= 0 && lastIndex + 1 < end
        ? templates[lastIndex + 1]
        : undefined;
    const prevItem = start > 0 ? templates[start - 1] : undefined;
    const nextCursor = nextItem ? nextItem.id : undefined;
    const prevCursor = prevItem ? prevItem.id : undefined;

    return {
      slice,
      paging: {
        cursors: {
          before: prevCursor ?? null,
          after: nextCursor ?? null,
        },
      },
      total,
    };
  };

  // ----- WABA-level subscribed_apps (override callback) -----

  router.post("/:id/subscribed_apps", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "waba_id_required" });
    }

    const { override_callback_uri, verify_token } = req.body ?? {};

    if (override_callback_uri === undefined && verify_token === undefined) {
      // Empty body: clear override
      upsertWaba({
        wabaId: id,
        overrideCallbackUri: "",
        verifyToken: "",
      });
      return res.json({ success: true });
    }

    upsertWaba({
      wabaId: id,
      overrideCallbackUri: override_callback_uri,
      verifyToken: verify_token,
    });
    return res.json({ success: true });
  });

  router.get("/:id/subscribed_apps", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "waba_id_required" });
    }
    const waba = getWaba(id);
    if (!waba) {
      return res.json({ data: [] });
    }
    return res.json({
      data: [
        {
          whatsapp_business_api_data: {
            id: waba.wabaId,
            name: "Sandbox WABA",
            link: "https://developers.facebook.com/docs/whatsapp/cloud-api",
          },
          override_callback_uri: waba.overrideCallbackUri ?? null,
        },
      ],
    });
  });

  // ----- Phone-number level operations -----

  const allowedDataLocalizationRegions = new Set([
    "AU",
    "ID",
    "IN",
    "JP",
    "SG",
    "KR",
    "DE",
    "CH",
    "GB",
    "BR",
    "BH",
    "ZA",
    "AE",
    "CA",
  ]);

  // Request verification code: POST /<PHONE_ID>/request_code
  router.post("/:id/request_code", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { code_method, language, code_override } = req.body ?? {};
    if (
      (code_method !== "SMS" && code_method !== "VOICE") ||
      typeof language !== "string"
    ) {
      return res.status(400).json({
        error: "code_method_SMS_or_VOICE_and_language_required",
      });
    }

    const requestPayload: {
      id: string;
      method: "SMS" | "VOICE";
      language: string;
      codeOverride?: string;
    } = {
      id,
      method: code_method,
      language,
    };
    if (typeof code_override === "string") {
      requestPayload.codeOverride = code_override;
    }

    const pending = requestPhoneVerificationCode(requestPayload);

    if (!pending) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    // Graph API just returns success; we also echo code in sandbox for convenience.
    return res.json({
      success: true,
      sandbox: { verification_code: pending.code },
    });
  });

  // Verify code: POST /<PHONE_ID>/verify_code
  router.post("/:id/verify_code", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { code } = req.body ?? {};
    if (typeof code !== "string") {
      return res.status(400).json({ error: "code_required" });
    }

    const ok = verifyPhoneNumberCode({ id, code });
    if (!ok) {
      return res.status(400).json({ success: false, error: "invalid_code" });
    }
    return res.json({ success: true });
  });

  // Two-step verification: POST /<PHONE_ID>/two_step_verification
  router.post("/:id/two_step_verification", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { pin } = req.body ?? {};
    if (typeof pin !== "string" || !pin) {
      return res.status(400).json({ error: "pin_required" });
    }

    const saved = setTwoStepVerificationPin({ id, pin });
    if (!saved) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    return res.json({ success: true });
  });

  // Registration: POST /<PHONE_ID>/register
  router.post("/:id/register", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { messaging_product, pin, data_localization_region } = req.body ?? {};

    if (messaging_product !== "whatsapp") {
      return res
        .status(400)
        .json({ error: "messaging_product_whatsapp_required" });
    }

    if (typeof pin !== "string" || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "pin_must_be_6_digits" });
    }

    let normalizedRegion: string | undefined;
    if (data_localization_region !== undefined) {
      if (typeof data_localization_region !== "string") {
        return res
          .status(400)
          .json({ error: "data_localization_region_must_be_string" });
      }
      const upper = data_localization_region.toUpperCase();
      if (!allowedDataLocalizationRegions.has(upper)) {
        return res
          .status(400)
          .json({ error: "unsupported_data_localization_region" });
      }
      normalizedRegion = upper;
    }

    // Ensure the phone exists in state so registration works even if
    // it wasn't created via /api/phone-numbers beforehand.
    if (!getPhoneNumber(id)) {
      upsertPhoneNumber({
        id,
        displayPhoneNumber: id,
      });
    }

    const registerParams: {
      id: string;
      pin: string;
      dataLocalizationRegion?: string;
    } = { id, pin };

    if (normalizedRegion !== undefined) {
      registerParams.dataLocalizationRegion = normalizedRegion;
    }

    const result = registerPhoneNumber(registerParams);

    if (!result.ok) {
      if (result.error === "not_found") {
        return res.status(404).json({ error: "phone_not_found" });
      }

      return res.status(429).json({
        error: {
          message: "Registration limit reached for this phone number",
          code: 133016,
          error_subcode: 133016,
          is_transient: false,
        },
        sandbox: {
          retry_after_ms: result.retryAfterMs ?? null,
          attempts_in_window: result.attemptsInWindow ?? null,
          window_ms: 72 * 60 * 60 * 1000,
        },
      });
    }

    return res.json({
      success: true,
      registration_status: "registered",
      data_localization_region: normalizedRegion ?? null,
    });
  });

  // Deregistration: POST /<PHONE_ID>/deregister
  router.post("/:id/deregister", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const result = deregisterPhoneNumber({ id });

    if (!result.ok) {
      if (result.error === "not_found") {
        return res.status(404).json({ error: "phone_not_found" });
      }

      return res.status(429).json({
        error: {
          message: "Deregistration limit reached for this phone number",
          code: 133016,
          error_subcode: 133016,
          is_transient: false,
        },
        sandbox: {
          retry_after_ms: result.retryAfterMs ?? null,
          attempts_in_window: result.attemptsInWindow ?? null,
          window_ms: 72 * 60 * 60 * 1000,
        },
      });
    }

    return res.json({ success: true, registration_status: "deregistered" });
  });

  // Webhook configuration & subscription OR two-step PIN: POST /<PHONE_ID>
  router.post("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { webhook_configuration, pin } = req.body ?? {};

    if (typeof pin === "string" && !webhook_configuration) {
      const saved = setTwoStepVerificationPin({ id, pin });
      if (!saved) {
        return res.status(404).json({ error: "phone_not_found" });
      }
      return res.json({ success: true });
    }

    if (!webhook_configuration) {
      // Simulate default subscribe behavior without overrides
      upsertPhoneNumber({
        id,
        displayPhoneNumber: "",
      });
      return res.json({ success: true });
    }

    const { override_callback_uri, verify_token } = webhook_configuration;
    upsertPhoneNumber({
      id,
      displayPhoneNumber: "",
      webhookConfiguration: {
        overrideCallbackUri: override_callback_uri,
        verifyToken: verify_token,
      },
    });
    return res.json({ success: true });
  });

  router.get("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id_required" });
    }

    const phone = getPhoneNumber(id);
    if (!phone) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    const fieldsParam =
      typeof req.query.fields === "string" ? req.query.fields : "";
    const fieldList = fieldsParam
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    // If specific fields are requested, approximate Graph API shape.
    if (fieldList.length > 0) {
      const result: Record<string, unknown> = { id: phone.id };

      for (const field of fieldList) {
        if (field === "status") {
          const status =
            phone.verificationStatus === "VERIFIED"
              ? "CONNECTED"
              : phone.verificationStatus === "PENDING"
              ? "PENDING"
              : "UNKNOWN";
          result.status = status;
        } else if (field === "throughput") {
          result.throughput = "STANDARD";
        } else if (field === "name_status") {
          result.name_status = phone.verifiedName
            ? "AVAILABLE_WITHOUT_REVIEW"
            : "NONE";
        } else if (field === "quality_rating") {
          result.quality_rating = phone.qualityRating ?? "UNKNOWN";
        } else if (field === "verified_name") {
          result.verified_name = phone.verifiedName ?? null;
        } else if (field === "display_phone_number") {
          result.display_phone_number = phone.displayPhoneNumber;
        } else if (field === "code_verification_status") {
          result.code_verification_status = phone.verificationStatus;
        } else if (field === "account_mode") {
          result.account_mode = phone.accountMode ?? "SANDBOX";
        } else if (field === "webhook_configuration") {
          const waba = phone.wabaId ? getWaba(phone.wabaId) : undefined;
          result.webhook_configuration = {
            phone_number: phone.webhookConfiguration?.overrideCallbackUri ?? null,
            whatsapp_business_account: waba?.overrideCallbackUri ?? null,
            application: null,
          };
        } else if (field === "conversational_automation") {
          result.conversational_automation =
            getConversationalAutomation(id) ?? null;
        } else if (field === "data_localization_region") {
          result.data_localization_region = phone.dataLocalizationRegion ?? null;
        } else if (field === "registration_status") {
          result.registration_status = phone.registered ? "registered" : "deregistered";
        }
      }

      return res.json(result);
    }

    // No specific fields: basic phone-number representation
    return res.json({
      id: phone.id,
      display_phone_number: phone.displayPhoneNumber,
      verified_name: phone.verifiedName ?? null,
      quality_rating: phone.qualityRating ?? "UNKNOWN",
      code_verification_status: phone.verificationStatus,
    });
  });

  // ----- Business profile for a phone number -----

  // GET /<PHONE_ID>/whatsapp_business_profile
  router.get(
    "/:id/whatsapp_business_profile",
    (req: Request, res: Response) => {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "phone_id_required" });
      }

      const phone = getPhoneNumber(id);
      if (!phone) {
        return res.status(404).json({ error: "phone_not_found" });
      }

      const profile = getBusinessProfile(id);
      if (!profile) {
        return res.json({ data: [] });
      }

      return res.json({
        data: [
          {
            phone_number_id: id,
            address: profile.address ?? "",
            description: profile.description ?? "",
            email: profile.email ?? "",
            vertical: profile.vertical ?? "",
            websites: profile.websites ?? [],
            profile_picture_url: profile.profilePictureUrl ?? null,
            profile_picture_id: profile.profilePictureId ?? null,
          },
        ],
      });
    }
  );

  // POST /<PHONE_ID>/whatsapp_business_profile
  router.post(
    "/:id/whatsapp_business_profile",
    (req: Request, res: Response) => {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "phone_id_required" });
      }

      const phone = getPhoneNumber(id);
      if (!phone) {
        return res.status(404).json({ error: "phone_not_found" });
      }

      const body = req.body ?? {};

      const update: {
        phoneId: string;
        address?: string;
        description?: string;
        email?: string;
        vertical?: string;
        websites?: string[];
        profilePictureUrl?: string;
        profilePictureId?: string;
      } = { phoneId: id };

      if (typeof body.address === "string") {
        update.address = body.address;
      }
      if (typeof body.description === "string") {
        update.description = body.description;
      }
      if (typeof body.email === "string") {
        update.email = body.email;
      }
      if (typeof body.vertical === "string") {
        update.vertical = body.vertical;
      }
      if (Array.isArray(body.websites)) {
        update.websites = body.websites.filter(
          (w: unknown): w is string => typeof w === "string"
        );
      }
      if (typeof body.profile_picture_url === "string") {
        update.profilePictureUrl = body.profile_picture_url;
      }
      if (typeof body.profile_picture_id === "string") {
        update.profilePictureId = body.profile_picture_id;
      }

      const profile = upsertBusinessProfile(update);

      return res.json({
        data: [
          {
            phone_number_id: id,
            address: profile.address ?? "",
            description: profile.description ?? "",
            email: profile.email ?? "",
            vertical: profile.vertical ?? "",
            websites: profile.websites ?? [],
            profile_picture_url: profile.profilePictureUrl ?? null,
            profile_picture_id: profile.profilePictureId ?? null,
          },
        ],
      });
    }
  );

  // Example: GET /<WABA_ID>/phone_numbers (approximate)
  router.get("/:id/phone_numbers", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "waba_id_required" });
    }

    let phones = listPhoneNumbers().filter((p) => p.wabaId === id);

    // Optional filtering by account_mode (beta in real API)
    const filteringParam =
      typeof req.query.filtering === "string" ? req.query.filtering : "";
    if (filteringParam) {
      try {
        const parsed = JSON.parse(filteringParam);
        const filters = Array.isArray(parsed) ? parsed : [];
        const accountModeFilter = filters.find(
          (f: any) =>
            f &&
            f.field === "account_mode" &&
            f.operator === "EQUAL" &&
            typeof f.value === "string"
        );
        if (accountModeFilter) {
          const value = accountModeFilter.value as string;
          phones = phones.filter(
            (p) => (p.accountMode ?? "SANDBOX") === value
          );
        }
      } catch {
        // ignore invalid filtering
      }
    }

    // Optional sorting by last_onboarded_time
    const sortParam =
      typeof req.query.sort === "string" ? req.query.sort : "";
    if (sortParam) {
      try {
        const parsedSort = JSON.parse(sortParam);
        const sortFields = Array.isArray(parsedSort)
          ? parsedSort
          : [parsedSort];
        const hasAscending = sortFields.includes(
          "last_onboarded_time_ascending"
        );
        const hasDescending = sortFields.includes(
          "last_onboarded_time_descending"
        );
        if (hasAscending || hasDescending) {
          const direction = hasAscending ? 1 : -1;
          phones = [...phones].sort(
            (a, b) =>
              ((a.lastOnboardedTime ?? 0) - (b.lastOnboardedTime ?? 0)) *
              direction
          );
        }
      } catch {
        // ignore invalid sort param
      }
    }

    const data = phones.map((p) => ({
      id: p.id,
      display_phone_number: p.displayPhoneNumber,
      verified_name: p.verifiedName ?? "Sandbox Number",
      quality_rating: p.qualityRating ?? "UNKNOWN",
    }));

    return res.json({ data });
  });

  // ----- Messaging limits & sending (sandbox simulation) -----

  // GET /<PHONE_ID>/messaging_limits – sandbox-only summary
  router.get("/:id/messaging_limits", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const phone = getPhoneNumber(id);
    if (!phone) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    const summary = getMessagingSummaryForPhone(id);
    return res.json({
      data: {
        phone_number_id: id,
        tier: summary.tier,
        window_ms: summary.windowMs,
        unique_recipients_in_window: summary.windowUniqueRecipients,
        max_unique_recipients: summary.limitUniqueRecipients,
        total_cost_usd: summary.totalCostUsd,
      },
    });
  });

  // ----- Analytics / insights stubs -----

  router.get("/:id/conversation_analytics", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id_required" });
    }

    const now = Date.now();
    const start = parseTimeMs(req.query.start) ?? now - 24 * 60 * 60 * 1000;
    const end = parseTimeMs(req.query.end) ?? now;

    if (start > end) {
      return res.status(400).json({
        error: "start_after_end",
        message: "start must be before end",
      });
    }

    const phone = getPhoneNumber(id);
    const phoneIds = phone
      ? [phone.id]
      : listPhoneNumbers()
          .filter((p) => p.wabaId === id)
          .map((p) => p.id);
    const entity =
      phone && phone.wabaId && phone.wabaId !== id
        ? "phone_number"
        : phone
        ? "phone_number"
        : "whatsapp_business_account";

    const events = phoneIds.flatMap((pid) =>
      listSendEvents({ phoneId: pid, since: start, until: end })
    );

    const categoryCounts: Record<ConversationCategory, number> = {
      MARKETING: 0,
      UTILITY: 0,
      AUTHENTICATION: 0,
      UNKNOWN: 0,
    };
    const recipients = new Set<string>();
    let totalCost = 0;

    for (const event of events) {
      if (categoryCounts[event.category] === undefined) {
        categoryCounts.UNKNOWN += 1;
      } else {
        categoryCounts[event.category] += 1;
      }
      totalCost += event.costUsd;
      recipients.add(event.to);
    }

    const responseEntry = {
      type: "conversation_analytics",
      entity,
      phone_number_ids: phoneIds,
      whatsapp_business_account_id: phone?.wabaId ?? id,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      conversations: {
        total: events.length,
        by_category: categoryCounts,
      },
      unique_recipients: recipients.size,
      cost: {
        total_cost_usd: Number(totalCost.toFixed(4)),
      },
    };

    return res.json({
      data: [responseEntry],
      summary: { total_conversations: events.length },
      sandbox: {
        phone_ids: phoneIds,
        start_ms: start,
        end_ms: end,
        entity,
      },
    });
  });

  router.get("/:id/marketing_analytics", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id_required" });
    }

    const now = Date.now();
    const start = parseTimeMs(req.query.start) ?? now - 7 * 24 * 60 * 60 * 1000;
    const end = parseTimeMs(req.query.end) ?? now;

    if (start > end) {
      return res.status(400).json({
        error: "start_after_end",
        message: "start must be before end",
      });
    }

    const phone = getPhoneNumber(id);
    const phoneIds = phone
      ? [phone.id]
      : listPhoneNumbers()
          .filter((p) => p.wabaId === id)
          .map((p) => p.id);
    const entity = phone ? "phone_number" : "whatsapp_business_account";

    const sends = listMarketingSends().filter((send) => {
      const at = send.scheduledFor ?? send.sendTimestamp;
      return phoneIds.includes(send.phoneId) && at >= start && at <= end;
    });

    const sendLookup = new Map(sends.map((s) => [s.id, s]));
    const conversions = listMarketingConversions().filter((conv) => {
      if (!conv.sendId) return false;
      return sendLookup.has(conv.sendId);
    });

    const sendCategoryCounts: Record<TemplateCategory, number> = {
      MARKETING: 0,
      UTILITY: 0,
      AUTHENTICATION: 0,
      UNKNOWN: 0,
    };
    const conversionCounts: Record<string, number> = {};
    const uniqueRecipients = new Set<string>();

    for (const send of sends) {
      sendCategoryCounts[send.category] =
        (sendCategoryCounts[send.category] ?? 0) + 1;
      uniqueRecipients.add(send.to);
    }

    for (const conv of conversions) {
      conversionCounts[conv.event] = (conversionCounts[conv.event] ?? 0) + 1;
    }

    const spendEvents = phoneIds.flatMap((pid) =>
      listSendEvents({ phoneId: pid, since: start, until: end })
    );
    const marketingSpend = spendEvents
      .filter((evt) => evt.category === "MARKETING")
      .reduce((sum, evt) => sum + evt.costUsd, 0);

    const responseEntry = {
      type: "marketing_analytics",
      entity,
      phone_number_ids: phoneIds,
      whatsapp_business_account_id: phone?.wabaId ?? id,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      sends: {
        total: sends.length,
        scheduled: sends.filter((s) => typeof s.scheduledFor === "number")
          .length,
        by_category: sendCategoryCounts,
        unique_recipients: uniqueRecipients.size,
      },
      conversions: {
        total: conversions.length,
        by_event: conversionCounts,
      },
      spend: {
        estimated_marketing_cost_usd: Number(marketingSpend.toFixed(4)),
      },
    };

    return res.json({
      data: [responseEntry],
      summary: {
        total_sends: sends.length,
        total_conversions: conversions.length,
      },
      sandbox: {
        phone_ids: phoneIds,
        start_ms: start,
        end_ms: end,
        entity,
      },
    });
  });

  // POST /<PHONE_ID>/messages – simulate sending, mark-as-read, typing, and apply messaging limits
  router.post("/:id/messages", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const phone = getPhoneNumber(id);
    if (!phone) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    const body = req.body ?? {};

    // Mark message as read:
    // https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/mark-message-as-read
    if (body.status === "read" && typeof body.message_id === "string") {
      return res.json({ success: true });
    }

    const { to, type, template, interactive } = body;

    // Typing indicators:
    // https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators
    if (type === "typing") {
      if (typeof to !== "string" || !to) {
        return res
          .status(400)
          .json({ error: "to_required_for_typing_indicator" });
      }
      return res.json({ success: true });
    }

    if (typeof to !== "string" || !to) {
      return res.status(400).json({ error: "to_required" });
    }

    const flowInteractive =
      type === "interactive" &&
      interactive &&
      typeof interactive === "object" &&
      (interactive as any).type === "flow"
        ? (interactive as Record<string, unknown>)
        : undefined;

    let category: ConversationCategory = flowInteractive ? "UTILITY" : "UNKNOWN";
    if (type === "template" && template && typeof template === "object") {
      const tplCategory = (template as any).category;
      if (typeof tplCategory === "string") {
        const normalized = normalizeTemplateCategory(tplCategory);
        if (
          normalized === "MARKETING" ||
          normalized === "UTILITY" ||
          normalized === "AUTHENTICATION"
        ) {
          category = normalized;
        }
      }

      if (category === "UNKNOWN") {
        const tplName = (template as any).name;
        const languageObj = (template as any).language;
        const languageCode =
          languageObj &&
          typeof languageObj === "object" &&
          typeof (languageObj as any).code === "string"
            ? (languageObj as any).code
            : undefined;

        if (typeof tplName === "string") {
          const wabaId = phone.wabaId;
          const storedTemplate = getTemplateByName(
            tplName,
            languageCode,
            typeof wabaId === "string" ? wabaId : undefined
          );

          if (storedTemplate) {
            if (storedTemplate.status !== "APPROVED") {
              return res.status(400).json({
                error: "template_not_approved",
                sandbox: {
                  template_id: storedTemplate.id,
                  status: storedTemplate.status,
                  rejection_reason: storedTemplate.rejectionReason ?? null,
                },
              });
            }
            const storedCategory = storedTemplate.category;
            if (
              storedCategory === "MARKETING" ||
              storedCategory === "UTILITY" ||
              storedCategory === "AUTHENTICATION"
            ) {
              category = storedCategory;
            }
          }
        }
      }
    }

    const evaluation = evaluateMessagingLimit({
      phoneId: id,
      to,
    });

    if (!evaluation.allowed) {
      return res.status(429).json({
        error: {
          message: "Messaging limit reached for this phone number",
          type: "OAuthException",
          code: 131048,
          error_subcode: 2494098,
          is_transient: false,
          error_user_title: "Messaging limit exceeded",
          error_user_msg:
            "You have reached the maximum number of unique recipients for this phone number in the last 24 hours in the sandbox.",
        },
        sandbox: {
          tier: evaluation.tier,
          unique_recipients_in_window:
            evaluation.windowUniqueRecipients,
          max_unique_recipients: evaluation.limitUniqueRecipients,
          reason: evaluation.reason,
        },
      });
    }

    const registered = registerSend({
      phoneId: id,
      to,
      category,
    });

    const messageId = `wamid.SANDBOX-OUT-${Date.now()}`;

    const sandboxDetails: Record<string, unknown> = {
      cost_usd: registered.event.costUsd,
      total_cost_usd: registered.state.totalCostUsd,
      tier: registered.state.tier,
    };

    if (flowInteractive) {
      sandboxDetails.flow = {
        type: "flow",
        flow_id:
          (flowInteractive as any).flow_id ??
          (flowInteractive as any).id ??
          null,
        flow_token: (flowInteractive as any).flow_token ?? null,
        flow_action: (flowInteractive as any).flow_action ?? null,
        flow_action_payload:
          (flowInteractive as any).flow_action_payload ?? null,
      };
    }

    addEvent({
      direction: "outbound",
      type: "graph.message",
      source: "graph-messages",
      payload: {
        phone_id: id,
        to,
        type,
        template,
        interactive,
        category,
        messaging_limit: {
          tier: registered.state.tier,
          unique_recipients_in_window:
            registered.state.uniqueRecipientsInWindow,
        },
      },
    });

    // Graph API success shape for /messages
    return res.status(200).json({
      messages: [
        {
          id: messageId,
        },
      ],
      sandbox: sandboxDetails,
    });
  });

  // ----- Message templates on a WABA -----

  // POST /<PHONE_ID>/marketing_messages – simulate marketing template sends
  router.post("/:id/marketing_messages", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const phone = getPhoneNumber(id);
    if (!phone) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    const body = req.body ?? {};
    const {
      messaging_product,
      to,
      type,
      template,
      send_at,
      customer_observable_action,
    } = body;

    if (messaging_product && messaging_product !== "whatsapp") {
      return res.status(400).json({ error: "messaging_product_whatsapp_only" });
    }

    if (typeof to !== "string" || !to) {
      return res.status(400).json({ error: "to_required" });
    }

    if (type !== "template" || !template || typeof template !== "object") {
      return res.status(400).json({ error: "template_payload_required" });
    }

    // Parse send_at if provided (accept seconds or milliseconds)
    let sendAtMs: number | undefined;
    if (typeof send_at === "number") {
      sendAtMs = send_at < 10_000_000_000 ? send_at * 1000 : send_at;
    }

    const templateName = (template as any).name;
    const languageObj = (template as any).language;
    const languageCode =
      languageObj &&
      typeof languageObj === "object" &&
      typeof (languageObj as any).code === "string"
        ? (languageObj as any).code
        : undefined;

    if (typeof templateName !== "string") {
      return res.status(400).json({ error: "template.name_required" });
    }

    // Contact-level policy and marketing opt-in checks
    const policy = evaluatePolicyForWaId(to);
    if (!policy.allowed) {
      return res.status(403).json({
        error: "contact_blocked_by_policy",
        sandbox: { policy },
      });
    }

    const marketingEligibility = evaluateMarketingEligibility(to);
    if (!marketingEligibility.allowed) {
      return res.status(403).json({
        error: "marketing_opt_in_required",
        sandbox: { marketing: marketingEligibility },
      });
    }

    // Frequency cap for marketing sends
    const frequency = evaluateMarketingFrequency({ phoneId: id, to });
    if (!frequency.allowed) {
      return res.status(429).json({
        error: {
          message: "Marketing frequency cap reached for this recipient",
          type: "OAuthException",
          code: 131051,
          error_subcode: 2495001,
          is_transient: false,
        },
        sandbox: { frequency },
      });
    }

    // Apply messaging limits as well so the sandbox stays consistent
    const messagingLimitEvaluation = evaluateMessagingLimit({
      phoneId: id,
      to,
    });

    if (!messagingLimitEvaluation.allowed) {
      return res.status(429).json({
        error: {
          message: "Messaging limit reached for this phone number",
          type: "OAuthException",
          code: 131048,
          error_subcode: 2494098,
          is_transient: false,
          error_user_title: "Messaging limit exceeded",
          error_user_msg:
            "You have reached the maximum number of unique recipients for this phone number in the last 24 hours in the sandbox.",
        },
        sandbox: {
          tier: messagingLimitEvaluation.tier,
          unique_recipients_in_window:
            messagingLimitEvaluation.windowUniqueRecipients,
          max_unique_recipients: messagingLimitEvaluation.limitUniqueRecipients,
          reason: messagingLimitEvaluation.reason,
        },
      });
    }

    // Resolve category if the template already exists
    let category: TemplateCategory = "MARKETING";
    const wabaId = phone.wabaId;
    const storedTemplate = getTemplateByName(
      templateName,
      languageCode,
      typeof wabaId === "string" ? wabaId : undefined
    );
    if (storedTemplate) {
      if (storedTemplate.status !== "APPROVED") {
        return res.status(400).json({
          error: "template_not_approved",
          sandbox: {
            template_id: storedTemplate.id,
            status: storedTemplate.status,
            rejection_reason: storedTemplate.rejectionReason ?? null,
          },
        });
      }
      category = storedTemplate.category;
    }

    const marketingRecord = registerMarketingSend({
      phoneId: id,
      to,
      templateName,
      ...(languageCode ? { languageCode } : {}),
      category,
      ...(sendAtMs !== undefined ? { sendAt: sendAtMs } : {}),
    });

    const registered = registerSend({
      phoneId: id,
      to,
      category,
    });

    const messageId = `wamid.SANDBOX-MKT-${Date.now()}`;

    return res.status(200).json({
      messages: [
        {
          id: messageId,
        },
      ],
      contacts: [
        {
          input: to,
          wa_id: to,
        },
      ],
      customer_observable_action: customer_observable_action ?? null,
      sandbox: {
        marketing: marketingEligibility,
        frequency,
        policy,
        messaging_limit: {
          tier: registered.state.tier,
          total_cost_usd: registered.state.totalCostUsd,
          unique_recipients_in_window: registered.state.sends.length,
        },
        marketing_record: marketingRecord,
      },
    });
  });

  router.get("/:id/message_templates", (req: Request, res: Response) => {
    const { id } = req.params; // WABA ID
    if (!id) {
      return res.status(400).json({ error: "waba_id_required" });
    }

    const fields = parseFieldsParam(req.query.fields);
    const statuses = parseListParam(req.query.status)
      .map((s) => {
        const upper = s.toUpperCase();
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
        return undefined;
      })
      .filter(
        (
          status
        ): status is NonNullable<
          ReturnType<typeof normalizeTemplateStatus>
        > => Boolean(status)
      );
    const categories = parseListParam(req.query.category)
      .map((c) => {
        const normalized = normalizeTemplateCategory(c);
        if (
          normalized === "UNKNOWN" &&
          typeof c === "string" &&
          c.toUpperCase() !== "UNKNOWN"
        ) {
          return undefined;
        }
        return normalized;
      })
      .filter((c): c is TemplateCategory => Boolean(c));
    const rejectionReasons = parseListParam(
      req.query.rejection_reason
    ).map((r) => normalizeTemplateRejectionReason(r));
    const contains =
      typeof req.query.contains === "string"
        ? req.query.contains.toLowerCase()
        : undefined;
    const nameFilter =
      typeof req.query.name === "string"
        ? req.query.name.toLowerCase()
        : undefined;
    const languageFilter =
      typeof req.query.language === "string"
        ? req.query.language.toLowerCase()
        : undefined;

    const limit = parseLimit(req.query.limit, 25, 100);
    const before =
      typeof req.query.before === "string" ? req.query.before : undefined;
    const after =
      typeof req.query.after === "string" ? req.query.after : undefined;
    const orderParam =
      typeof req.query.order === "string"
        ? req.query.order.toLowerCase()
        : "desc";
    const order: "asc" | "desc" = orderParam === "asc" ? "asc" : "desc";

    let templates = listTemplates().filter(
      (tpl) => !tpl.wabaId || tpl.wabaId === id
    );

    if (nameFilter) {
      templates = templates.filter(
        (tpl) => tpl.name.toLowerCase() === nameFilter
      );
    }
    if (languageFilter) {
      templates = templates.filter(
        (tpl) => tpl.languageCode.toLowerCase() === languageFilter
      );
    }
    if (statuses.length > 0) {
      templates = templates.filter((tpl) => statuses.includes(tpl.status));
    }
    if (categories.length > 0) {
      templates = templates.filter((tpl) =>
        categories.includes(tpl.category)
      );
    }
    const cleanedRejectionReasons = rejectionReasons.filter(
      (
        reason
      ): reason is NonNullable<ReturnType<typeof normalizeTemplateRejectionReason>> =>
        Boolean(reason)
    );
    if (cleanedRejectionReasons.length > 0) {
      templates = templates.filter(
        (tpl) =>
          tpl.rejectionReason &&
          cleanedRejectionReasons.includes(tpl.rejectionReason)
      );
    }
    if (contains) {
      templates = templates.filter((tpl) => {
        const haystack = [
          tpl.name,
          tpl.languageCode,
          tpl.category,
          tpl.bodyText ?? "",
          tpl.headerText ?? "",
          tpl.footerText ?? "",
          tpl.rejectionNote ?? "",
          ...tpl.components.map((c) => c.text ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(contains);
      });
    }

    templates.sort((a, b) =>
      order === "desc" ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt
    );

    const paginationInput: {
      templates: MessageTemplate[];
      limit: number;
      after?: string;
      before?: string;
    } = { templates, limit };
    if (before) {
      paginationInput.before = before;
    }
    if (after) {
      paginationInput.after = after;
    }

    const { slice, paging, total } = paginateTemplates(paginationInput);

    return res.json({
      data: slice.map((tpl) => toGraphTemplate(tpl, fields)),
      paging,
      summary: { total_count: total },
      sandbox: {
        filters: {
          name: nameFilter ?? null,
          language: languageFilter ?? null,
          statuses,
          categories,
          rejection_reasons: cleanedRejectionReasons,
          contains: contains ?? null,
          order,
        },
      },
    });
  });

  router.post("/:id/message_templates", (req: Request, res: Response) => {
    const { id } = req.params; // WABA ID
    if (!id) {
      return res.status(400).json({ error: "waba_id_required" });
    }

    const { name, language, category, components, status, rejection_reason } =
      req.body ?? {};
    if (typeof name !== "string" || typeof language !== "string") {
      return res.status(400).json({
        error: "name_and_language_required",
      });
    }

    const sanitizedComponents = sanitizeComponentsInput(components);
    const extracted = extractTextFromComponents(sanitizedComponents);

    if (!extracted.bodyText) {
      return res.status(400).json({
        error: "BODY_component_with_text_required",
      });
    }

    try {
      const normalizedRejectionReason =
        normalizeTemplateRejectionReason(rejection_reason);
      const templateInput: {
        name: string;
        languageCode: string;
        category?: TemplateCategory;
        components: TemplateComponent[];
        bodyText: string;
        headerText?: string;
        footerText?: string;
        wabaId: string;
        status: ReturnType<typeof normalizeTemplateStatus>;
        rejectionReason?: TemplateRejectionReason;
      } = {
        name,
        languageCode: language,
        components: sanitizedComponents,
        bodyText: extracted.bodyText,
        wabaId: id,
        status: normalizeTemplateStatus(status, "PENDING"),
      };

      if (category) {
        templateInput.category = normalizeTemplateCategory(category);
      }
      if (extracted.headerText !== undefined) {
        templateInput.headerText = extracted.headerText;
      }
      if (extracted.footerText !== undefined) {
        templateInput.footerText = extracted.footerText;
      }
      if (normalizedRejectionReason !== undefined) {
        templateInput.rejectionReason = normalizedRejectionReason;
      }

      const tpl = createTemplate(templateInput);

      return res.status(201).json({
        id: tpl.id,
        status: tpl.status,
        category: tpl.category,
        rejection_reason: tpl.rejectionReason ?? null,
        components: tpl.components,
        sandbox: {
          status_history: tpl.statusHistory,
        },
      });
    } catch (err) {
      return res.status(400).json({
        error: "template_creation_failed",
        message: err instanceof Error ? err.message : "unknown_error",
      });
    }
  });

  router.post(
    "/:id/message_templates/:templateId/status",
    (req: Request, res: Response) => {
      const { id, templateId } = req.params;
      if (!id || !templateId) {
        return res.status(400).json({ error: "waba_id_and_template_id_required" });
      }

      const tpl = getTemplateById(templateId);
      if (!tpl || (tpl.wabaId && tpl.wabaId !== id)) {
        return res.status(404).json({ error: "template_not_found" });
      }

      const { status, rejection_reason, rejection_note } = req.body ?? {};
      if (typeof status !== "string") {
        return res.status(400).json({ error: "status_required" });
      }

      const normalizedStatus = normalizeTemplateStatus(status, tpl.status);
      const rejectionReason = normalizeTemplateRejectionReason(rejection_reason);
      const statusOptions: {
        rejectionReason?: TemplateRejectionReason;
        rejectionNote?: string;
      } = {};
      if (rejectionReason !== undefined) {
        statusOptions.rejectionReason = rejectionReason;
      }
      if (typeof rejection_note === "string") {
        statusOptions.rejectionNote = rejection_note;
      }

      const updated = updateTemplateStatus(
        templateId,
        normalizedStatus,
        statusOptions
      );

      if (!updated) {
        return res.status(404).json({ error: "template_not_found" });
      }

      return res.json({
        data: toGraphTemplate(updated),
        sandbox: { status_history: updated.statusHistory },
      });
    }
  );

  router.delete("/:id/message_templates", (req: Request, res: Response) => {
    const { id } = req.params; // WABA ID
    if (!id) {
      return res.status(400).json({ error: "waba_id_required" });
    }

    const templateId =
      typeof req.query.id === "string"
        ? req.query.id
        : typeof req.query.template_id === "string"
        ? req.query.template_id
        : undefined;
    const { name, language } = req.query;

    let tpl: MessageTemplate | undefined;
    if (templateId) {
      tpl = getTemplateById(templateId);
      if (!tpl || (tpl.wabaId && tpl.wabaId !== id)) {
        return res.status(404).json({ error: "template_not_found" });
      }
    } else {
      if (typeof name !== "string") {
        return res.status(400).json({ error: "name_required" });
      }
      tpl = getTemplateByName(
        name,
        typeof language === "string" ? language : undefined,
        id
      );
      if (!tpl) {
        return res.status(404).json({ error: "template_not_found" });
      }
    }

    deleteTemplate(tpl.id);
    return res.json({ success: true });
  });

  // Conversational automation (welcome message, commands, prompts)
  router.get("/:id/conversational_automation", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const config = getConversationalAutomation(id);
    if (!config) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    return res.json({ conversational_automation: config, id });
  });

  router.post("/:id/conversational_automation", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { enable_welcome_message, commands, prompts } = req.body ?? {};

    if (enable_welcome_message !== undefined && typeof enable_welcome_message !== "boolean") {
      return res
        .status(400)
        .json({ error: "enable_welcome_message_must_be_boolean" });
    }

    let sanitizedCommands:
      | { command_name: string; command_description: string }[]
      | undefined;
    if (commands !== undefined) {
      if (!Array.isArray(commands)) {
        return res.status(400).json({ error: "commands_must_be_array" });
      }
      if (commands.length > 30) {
        return res.status(400).json({ error: "commands_exceed_limit_30" });
      }

      sanitizedCommands = [];
      for (const cmd of commands) {
        const name = cmd && typeof (cmd as any).command_name === "string" ? (cmd as any).command_name : undefined;
        const description =
          cmd && typeof (cmd as any).command_description === "string"
            ? (cmd as any).command_description
            : undefined;

        if (!name || !description) {
          return res.status(400).json({ error: "command_name_and_description_required" });
        }
        if (name.length > 32) {
          return res.status(400).json({ error: "command_name_max_32_chars" });
        }
        if (description.length > 256) {
          return res.status(400).json({ error: "command_description_max_256_chars" });
        }

        sanitizedCommands.push({ command_name: name, command_description: description });
      }
    }

    let sanitizedPrompts: string[] | undefined;
    if (prompts !== undefined) {
      if (!Array.isArray(prompts)) {
        return res.status(400).json({ error: "prompts_must_be_array" });
      }
      if (prompts.length > 4) {
        return res.status(400).json({ error: "prompts_exceed_limit_4" });
      }

      sanitizedPrompts = [];
      for (const p of prompts) {
        if (typeof p !== "string") {
          return res.status(400).json({ error: "prompt_must_be_string" });
        }
        if (p.length > 80) {
          return res.status(400).json({ error: "prompt_max_80_chars" });
        }
        sanitizedPrompts.push(p);
      }
    }

    const updateParams: Parameters<
      typeof updateConversationalAutomation
    >[0] = { id };

    if (typeof enable_welcome_message === "boolean") {
      updateParams.enableWelcomeMessage = enable_welcome_message;
    }
    if (sanitizedCommands !== undefined) {
      updateParams.commands = sanitizedCommands;
    }
    if (sanitizedPrompts !== undefined) {
      updateParams.prompts = sanitizedPrompts;
    }

    const updated = updateConversationalAutomation(updateParams);

    if (!updated) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    return res.json({ success: true, conversational_automation: updated });
  });

  // Identity change check settings:
  // POST /<PHONE_ID>/settings with
  // { "user_identity_change": { "enable_identity_key_check": boolean } }
  router.post("/:id/settings", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { user_identity_change } = req.body ?? {};
    if (
      !user_identity_change ||
      typeof user_identity_change.enable_identity_key_check !== "boolean"
    ) {
      return res.status(400).json({
        error: "user_identity_change.enable_identity_key_check_required",
      });
    }

    const ok = setIdentityKeyCheckForNumber({
      id,
      enableIdentityKeyCheck:
        user_identity_change.enable_identity_key_check,
    });

    if (!ok) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    return res.json({ success: true });
  });

  return router;
};

export default createGraphRouter;
