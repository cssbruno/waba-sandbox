import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { WebhookForwarder } from "../services/forwarder";
import {
  WabaWebhookPayload,
  WabaMessage,
  WabaTextMessage,
  WabaImageMessage,
  WabaDocumentMessage,
  WabaAudioMessage,
  WabaVideoMessage,
  WabaLocationMessage,
  WabaContactsMessage,
  WabaStickerMessage,
  WabaReactionMessage,
  WabaTemplateMessage,
  WabaInteractiveMessage,
} from "../types/waba";
import { addEvent } from "../state/eventStore";
import { evaluatePolicyForWaId } from "../state/policy";
import { resolveWebhookTarget } from "../state/webhookRouting";

interface SimulateMessageBody {
  from: string;
  body: string;
  waId?: string;
  name?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  wabaId?: string;
}

interface SimulateMediaBaseBody {
  from: string;
  waId?: string;
  name?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  wabaId?: string;
}

interface SimulateImageBody extends SimulateMediaBaseBody {
  caption?: string;
  mediaUrl?: string;
}

interface SimulateDocumentBody extends SimulateMediaBaseBody {
  filename?: string;
  caption?: string;
  mediaUrl?: string;
}

interface SimulateAudioBody extends SimulateMediaBaseBody {
  mediaUrl?: string;
  voice?: boolean;
}

interface SimulateVideoBody extends SimulateMediaBaseBody {
  caption?: string;
  mediaUrl?: string;
}

interface SimulateLocationBody extends SimulateMediaBaseBody {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

interface SimulateContactsBody extends SimulateMediaBaseBody {
  formattedName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface SimulateStickerBody extends SimulateMediaBaseBody {
  mediaUrl?: string;
}

interface SimulateReactionBody extends SimulateMediaBaseBody {
  messageId: string;
  emoji: string;
}

interface SimulateTemplateBody extends SimulateMediaBaseBody {
  templateName: string;
  languageCode: string;
}

interface SimulateInteractiveButtonsBody extends SimulateMediaBaseBody {
  buttonId: string;
  buttonTitle: string;
}

interface SimulateInteractiveListBody extends SimulateMediaBaseBody {
  selectionId: string;
  selectionTitle: string;
  selectionDescription?: string;
}

interface SimulateInteractiveProductCarouselBody extends SimulateMediaBaseBody {
  productIds: string[];
}

interface SimulateInteractiveMediaCarouselBody extends SimulateMediaBaseBody {
  mediaIds: string[];
}

interface SimulateFlowCompleteBody extends SimulateMediaBaseBody {
  flowToken?: string;
  flowId?: string;
  flowName?: string;
  flowAction?: string;
  flowActionPayload?: Record<string, unknown>;
  flowCta?: string;
}

interface SimulateContextReplyBody extends SimulateMessageBody {
  contextMessageId: string;
}

interface SimulateTypingBody extends SimulateMediaBaseBody {
  recipientId: string;
  typing: "on" | "off";
}

interface SimulateStatusBody {
  messageId: string;
  recipientId: string;
  status: "sent" | "delivered" | "read" | "failed";
  phoneNumberId?: string;
  wabaId?: string;
}

export const createSimulateRouter = (): Router => {
  const router = Router();

  const requireTarget = (res: Response): string | undefined => {
    const { targetWebhookUrl } = getConfig();
    if (!targetWebhookUrl) {
      res.status(400).json({
        error:
          "Target webhook URL is not configured. Set it at runtime via the configuration API or UI.",
      });
      return undefined;
    }
    return targetWebhookUrl;
  };

  const buildBasePayload = (
    message: WabaMessage,
    opts: {
      waId: string;
      name: string;
      phoneNumberId: string;
      displayPhoneNumber: string;
    }
  ): WabaWebhookPayload => {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "sandbox-whatsapp-business-account",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: opts.displayPhoneNumber,
                  phone_number_id: opts.phoneNumberId,
                },
                contacts: [
                  {
                    profile: { name: opts.name },
                    wa_id: opts.waId,
                  },
                ],
                messages: [message],
              },
            },
          ],
        },
      ],
    };
  };

  router.post("/message", async (req: Request, res: Response) => {

    const {
      from,
      body,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      wabaId,
      webhookAppSecret,
    } = req.body as SimulateMessageBody & { webhookAppSecret?: string };

    if (!from || !body) {
      return res
        .status(400)
        .json({ error: "'from' and 'body' fields are required" });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-TEXT-${Date.now()}`;

    const message: WabaTextMessage = {
      from,
      id: messageId,
      timestamp,
      type: "text",
      text: {
        body,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const targetContext =
      resolveWebhookTarget({
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(wabaId ? { wabaId } : {}),
      }) ?? null;
    const targetUrl = targetContext?.url ?? requireTarget(res);
    if (!targetUrl) return;

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload, {
      appSecret: webhookAppSecret || targetContext?.appSecret || undefined,
    });

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-text",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
        resolvedSource: targetContext?.source ?? "app",
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/status", async (req: Request, res: Response) => {
    const {
      messageId,
      recipientId,
      status,
      phoneNumberId,
      wabaId,
      webhookAppSecret,
    } = req.body as SimulateStatusBody & { webhookAppSecret?: string };

    if (!messageId || !recipientId || !status) {
      return res.status(400).json({
        error: "'messageId', 'recipientId' and 'status' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();

    const payload: WabaWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "sandbox-whatsapp-business-account",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "0000000000",
                  phone_number_id: "000000000000000",
                },
                statuses: [
                  {
                    id: messageId,
                    status,
                    timestamp,
                    recipient_id: recipientId,
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const targetContext =
      resolveWebhookTarget({
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(wabaId ? { wabaId } : {}),
      }) ?? null;
    const targetUrl = targetContext?.url ?? requireTarget(res);
    if (!targetUrl) return;

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload, {
      appSecret: webhookAppSecret || undefined,
    });

    addEvent({
      direction: "outbound",
      type: "simulate.status",
      source: "simulate-status",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(recipientId),
        resolvedSource: targetContext?.source ?? "app",
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      payload,
      forwardStatus: result.status,
    });
  });

  // Separate, more explicit endpoints for media messages
  router.post("/image", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      caption = "Sample image from sandbox",
      mediaUrl = "http://localhost:3737/media/sample-image.png",
    } = req.body as SimulateImageBody;

    if (!from) {
      return res.status(400).json({ error: "'from' is required" });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-IMAGE-${Date.now()}`;

    const message: WabaImageMessage = {
      from,
      id: messageId,
      timestamp,
      type: "image",
      image: {
        caption,
        mime_type: "image/png",
        link: mediaUrl,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-image",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/document", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      filename = "sample-document.pdf",
      caption = "Sample document from sandbox",
      mediaUrl = "http://localhost:3737/media/sample-document.pdf",
    } = req.body as SimulateDocumentBody;

    if (!from) {
      return res.status(400).json({ error: "'from' is required" });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-DOC-${Date.now()}`;

    const message: WabaDocumentMessage = {
      from,
      id: messageId,
      timestamp,
      type: "document",
      document: {
        filename,
        caption,
        mime_type: "application/pdf",
        link: mediaUrl,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-document",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/audio", async (req: Request, res: Response) => {
    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      voice = false,
      mediaUrl = "http://localhost:3737/media/sample-audio.ogg",
      wabaId,
    } = req.body as SimulateAudioBody;

    if (!from) {
      return res.status(400).json({ error: "'from' is required" });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-AUDIO-${Date.now()}`;

    const message: WabaAudioMessage = {
      from,
      id: messageId,
      timestamp,
      type: "audio",
      audio: {
        mime_type: "audio/ogg",
        voice,
        link: mediaUrl,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const targetContext =
      resolveWebhookTarget({
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(wabaId ? { wabaId } : {}),
      }) ?? null;
    const targetUrl = targetContext?.url ?? requireTarget(res);
    if (!targetUrl) return;

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-audio",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
        resolvedSource: targetContext?.source ?? "app",
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/video", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      caption = "Sample video from sandbox",
      mediaUrl = "http://localhost:3737/media/sample-video.mp4",
    } = req.body as SimulateVideoBody;

    if (!from) {
      return res.status(400).json({ error: "'from' is required" });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-VIDEO-${Date.now()}`;

    const message: WabaVideoMessage = {
      from,
      id: messageId,
      timestamp,
      type: "video",
      video: {
        mime_type: "video/mp4",
        caption,
        link: mediaUrl,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-video",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/location", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      latitude,
      longitude,
      address = "Sandbox street 123",
      name: locationName = "Sandbox Location",
    } = req.body as SimulateLocationBody;

    if (!from || latitude == null || longitude == null) {
      return res.status(400).json({
        error: "'from', 'latitude' and 'longitude' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-LOCATION-${Date.now()}`;

    const message: WabaLocationMessage = {
      from,
      id: messageId,
      timestamp,
      type: "location",
      location: {
        latitude,
        longitude,
        name: locationName,
        address,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-location",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/contacts", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      formattedName,
      firstName,
      lastName,
      phone,
      email,
      street,
      city,
      state,
      zip,
      country,
    } = req.body as SimulateContactsBody;

    if (!from || !formattedName) {
      return res.status(400).json({
        error: "'from' and 'formattedName' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-CONTACT-${Date.now()}`;

    const nameObj: WabaContactsMessage["contacts"][number]["name"] = {
      formatted_name: formattedName,
    };
    if (firstName !== undefined) {
      nameObj.first_name = firstName;
    }
    if (lastName !== undefined) {
      nameObj.last_name = lastName;
    }

    const contact: WabaContactsMessage["contacts"][number] = {
      name: nameObj,
    };

    if (phone) {
      contact.phones = [
        {
          phone,
          type: "CELL",
          wa_id: waId,
        },
      ];
    }

    if (email) {
      contact.emails = [
        {
          email,
          type: "WORK",
        },
      ];
    }

    if (street || city || state || zip || country) {
      const address: NonNullable<
        WabaContactsMessage["contacts"][number]["addresses"]
      >[number] = {};
      if (street !== undefined) address.street = street;
      if (city !== undefined) address.city = city;
      if (state !== undefined) address.state = state;
      if (zip !== undefined) address.zip = zip;
      if (country !== undefined) address.country = country;
      address.type = "HOME";
      contact.addresses = [address];
    }

    const message: WabaContactsMessage = {
      from,
      id: messageId,
      timestamp,
      type: "contacts",
      contacts: [contact],
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-contacts",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/sticker", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      mediaUrl = "http://localhost:3737/media/sample-sticker.webp",
    } = req.body as SimulateStickerBody;

    if (!from) {
      return res.status(400).json({
        error: "'from' is required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-STICKER-${Date.now()}`;

    const message: WabaStickerMessage = {
      from,
      id: messageId,
      timestamp,
      type: "sticker",
      sticker: {
        mime_type: "image/webp",
        link: mediaUrl,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-sticker",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/reaction", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      messageId,
      emoji,
    } = req.body as SimulateReactionBody;

    if (!from || !messageId || !emoji) {
      return res.status(400).json({
        error: "'from', 'messageId' and 'emoji' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const reactionMessageId = `wamid.SANDBOX-REACTION-${Date.now()}`;

    const message: WabaReactionMessage = {
      from,
      id: reactionMessageId,
      timestamp,
      type: "reaction",
      reaction: {
        message_id: messageId,
        emoji,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-reaction",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId: reactionMessageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/template", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      templateName,
      languageCode,
    } = req.body as SimulateTemplateBody;

    if (!from || !templateName || !languageCode) {
      return res.status(400).json({
        error: "'from', 'templateName' and 'languageCode' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-TEMPLATE-${Date.now()}`;

    const message: WabaTemplateMessage = {
      from,
      id: messageId,
      timestamp,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-template",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/interactive/buttons", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      buttonId,
      buttonTitle,
    } = req.body as SimulateInteractiveButtonsBody;

    if (!from || !buttonId || !buttonTitle) {
      return res.status(400).json({
        error: "'from', 'buttonId' and 'buttonTitle' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-INT-BUTTONS-${Date.now()}`;

    const message: WabaInteractiveMessage = {
      from,
      id: messageId,
      timestamp,
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: {
          id: buttonId,
          title: buttonTitle,
        },
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-interactive-buttons",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/interactive/list", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      selectionId,
      selectionTitle,
      selectionDescription,
    } = req.body as SimulateInteractiveListBody;

    if (!from || !selectionId || !selectionTitle) {
      return res.status(400).json({
        error: "'from', 'selectionId' and 'selectionTitle' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-INT-LIST-${Date.now()}`;

    const listReply: NonNullable<
      WabaInteractiveMessage["interactive"]["list_reply"]
    > = {
      id: selectionId,
      title: selectionTitle,
    };
    if (selectionDescription !== undefined) {
      listReply.description = selectionDescription;
    }

    const message: WabaInteractiveMessage = {
      from,
      id: messageId,
      timestamp,
      type: "interactive",
      interactive: {
        type: "list_reply",
        list_reply: listReply,
      },
    };

    const payload = buildBasePayload(message, {
      waId,
      name,
      phoneNumberId,
      displayPhoneNumber,
    });

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-interactive-list",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post(
    "/interactive/product-carousel",
    async (req: Request, res: Response) => {
      const targetUrl = requireTarget(res);
      if (!targetUrl) return;

      const {
        from,
        waId = from,
        name = "Sandbox User",
        phoneNumberId = "000000000000000",
        displayPhoneNumber = "0000000000",
        productIds = [],
      } = req.body as SimulateInteractiveProductCarouselBody;

      if (!from || !productIds || productIds.length === 0) {
        return res.status(400).json({
          error: "'from' and at least one 'productIds' entry are required",
        });
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const messageId = `wamid.SANDBOX-INT-PRODUCT-${Date.now()}`;

      const message: WabaInteractiveMessage = {
        from,
        id: messageId,
        timestamp,
        type: "interactive",
        interactive: {
          type: "product_list",
          products: productIds.map((id) => ({ id })),
        },
      };

      const payload = buildBasePayload(message, {
        waId,
        name,
        phoneNumberId,
        displayPhoneNumber,
      });

      const forwarder = new WebhookForwarder(targetUrl);
      const result = await forwarder.forward(payload);

      addEvent({
        direction: "outbound",
        type: "simulate.message",
        source: "simulate-interactive-product-carousel",
        payload,
        meta: {
          targetUrl,
          forwardStatus: result.status,
          policy: evaluatePolicyForWaId(waId),
        },
      });

      return res.status(200).json({
        forwardedTo: targetUrl,
        messageId,
        payload,
        forwardStatus: result.status,
      });
    }
  );

  router.post(
    "/interactive/media-carousel",
    async (req: Request, res: Response) => {
      const targetUrl = requireTarget(res);
      if (!targetUrl) return;

      const {
        from,
        waId = from,
        name = "Sandbox User",
        phoneNumberId = "000000000000000",
        displayPhoneNumber = "0000000000",
        mediaIds = [],
      } = req.body as SimulateInteractiveMediaCarouselBody;

      if (!from || !mediaIds || mediaIds.length === 0) {
        return res.status(400).json({
          error: "'from' and at least one 'mediaIds' entry are required",
        });
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const messageId = `wamid.SANDBOX-INT-MEDIA-${Date.now()}`;

      const message: WabaInteractiveMessage = {
        from,
        id: messageId,
        timestamp,
        type: "interactive",
        interactive: {
          type: "media",
          media: mediaIds.map((id) => ({ id })),
        },
      };

      const payload = buildBasePayload(message, {
        waId,
        name,
        phoneNumberId,
        displayPhoneNumber,
      });

      const forwarder = new WebhookForwarder(targetUrl);
      const result = await forwarder.forward(payload);

      addEvent({
        direction: "outbound",
        type: "simulate.message",
        source: "simulate-interactive-media-carousel",
        payload,
        meta: {
          targetUrl,
          forwardStatus: result.status,
          policy: evaluatePolicyForWaId(waId),
        },
      });

      return res.status(200).json({
        forwardedTo: targetUrl,
        messageId,
        payload,
        forwardStatus: result.status,
      });
    }
  );

  router.post(
    "/interactive/flow-completed",
    async (req: Request, res: Response) => {
      const {
        from,
        waId = from,
        name = "Sandbox User",
        phoneNumberId = "000000000000000",
        displayPhoneNumber = "0000000000",
        flowToken = "sandbox-flow-token",
        flowId = "sandbox-flow-id",
        flowName = "Sandbox Flow",
        flowAction = "complete",
        flowActionPayload = {},
        flowCta = "Open",
        wabaId,
      } = req.body as SimulateFlowCompleteBody;

      if (!from) {
        return res.status(400).json({
          error: "'from' is required",
        });
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const messageId = `wamid.SANDBOX-FLOW-${Date.now()}`;

      const message: WabaInteractiveMessage = {
        from,
        id: messageId,
        timestamp,
        type: "interactive",
        interactive: {
          type: "flow",
          flow_token: flowToken,
          flow_id: flowId,
          flow_name: flowName,
          flow_action: flowAction,
          flow_action_payload: flowActionPayload,
          flow_cta: flowCta,
          flow_status: "completed",
        },
      };

      const payload = buildBasePayload(message, {
        waId,
        name,
        phoneNumberId,
        displayPhoneNumber,
      });

      const targetContext =
        resolveWebhookTarget({
          ...(phoneNumberId ? { phoneNumberId } : {}),
          ...(wabaId ? { wabaId } : {}),
        }) ?? null;
      const targetUrl = targetContext?.url ?? requireTarget(res);
      if (!targetUrl) return;

      const forwarder = new WebhookForwarder(targetUrl);
      const result = await forwarder.forward(payload);

      addEvent({
        direction: "outbound",
        type: "simulate.message",
        source: "simulate-interactive-flow",
        payload,
        meta: {
          targetUrl,
          forwardStatus: result.status,
          policy: evaluatePolicyForWaId(waId),
          resolvedSource: targetContext?.source ?? "app",
        },
      });

      return res.status(200).json({
        forwardedTo: targetUrl,
        messageId,
        payload,
        forwardStatus: result.status,
      });
    }
  );

  router.post("/context-reply", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      body,
      contextMessageId,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
    } = req.body as SimulateContextReplyBody;

    if (!from || !body || !contextMessageId) {
      return res.status(400).json({
        error: "'from', 'body' and 'contextMessageId' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-CONTEXT-${Date.now()}`;

    const message: WabaTextMessage & {
      context: { message_id: string };
    } = {
      from,
      id: messageId,
      timestamp,
      type: "text",
      text: {
        body,
      },
      context: {
        message_id: contextMessageId,
      },
    };

    const payload: WabaWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "sandbox-whatsapp-business-account",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: displayPhoneNumber,
                  phone_number_id: phoneNumberId,
                },
                contacts: [
                  {
                    profile: { name },
                    wa_id: waId,
                  },
                ],
                messages: [message],
              },
            },
          ],
        },
      ],
    };

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.message",
      source: "simulate-context-reply",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        policy: evaluatePolicyForWaId(waId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      messageId,
      payload,
      forwardStatus: result.status,
    });
  });

  router.post("/typing", async (req: Request, res: Response) => {
    const targetUrl = requireTarget(res);
    if (!targetUrl) return;

    const {
      from,
      waId = from,
      name = "Sandbox User",
      phoneNumberId = "000000000000000",
      displayPhoneNumber = "0000000000",
      recipientId,
      typing,
    } = req.body as SimulateTypingBody;

    if (!from || !recipientId || !typing) {
      return res.status(400).json({
        error: "'from', 'recipientId' and 'typing' are required",
      });
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const messageId = `wamid.SANDBOX-TYPING-${Date.now()}`;

    const payload: WabaWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "sandbox-whatsapp-business-account",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: displayPhoneNumber,
                  phone_number_id: phoneNumberId,
                },
                contacts: [
                  {
                    profile: { name },
                    wa_id: waId,
                  },
                ],
                statuses: [
                  {
                    id: messageId,
                    status: "typing",
                    timestamp,
                    recipient_id: recipientId,
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const forwarder = new WebhookForwarder(targetUrl);
    const result = await forwarder.forward(payload);

    addEvent({
      direction: "outbound",
      type: "simulate.status",
      source: "simulate-typing",
      payload,
      meta: {
        targetUrl,
        forwardStatus: result.status,
        typing,
        policy: evaluatePolicyForWaId(recipientId),
      },
    });

    return res.status(200).json({
      forwardedTo: targetUrl,
      payload,
      forwardStatus: result.status,
    });
  });

  return router;
};
