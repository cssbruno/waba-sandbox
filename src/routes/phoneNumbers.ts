import { Router, Request, Response } from "express";
import {
  getPhoneNumber,
  getWaba,
  listPhoneNumbers,
  listWabas,
  upsertPhoneNumber,
  upsertWaba,
} from "../state/webhookRouting";

export const createPhoneNumbersRouter = (): Router => {
  const router = Router();

  // Simple Cloud API–style phone-number registry
  router.get("/", (_req: Request, res: Response) => {
    res.json({ phone_numbers: listPhoneNumbers() });
  });

  router.post("/", (req: Request, res: Response) => {
    const { id, displayPhoneNumber, wabaId } = req.body ?? {};
    if (
      typeof id !== "string" ||
      typeof displayPhoneNumber !== "string" ||
      !id ||
      !displayPhoneNumber
    ) {
      return res
        .status(400)
        .json({ error: "id_and_displayPhoneNumber_required" });
    }

    const phone = upsertPhoneNumber({
      id,
      displayPhoneNumber,
      wabaId,
    });

    return res.status(201).json(phone);
  });

  router.get("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }
    const phone = getPhoneNumber(id);
    if (!phone) {
      return res.status(404).json({ error: "phone_not_found" });
    }
    return res.json(phone);
  });

  // WABA-level overrides (similar to /<WABA_ID>/subscribed_apps)
  router.get("/wabas", (_req: Request, res: Response) => {
    res.json({ wabas: listWabas() });
  });

  router.post("/wabas/:wabaId/subscribed-apps", (req: Request, res: Response) => {
    const { wabaId } = req.params;
    if (!wabaId) {
      return res.status(400).json({ error: "wabaId_required" });
    }

    const { override_callback_uri, verify_token } = req.body ?? {};

    if (override_callback_uri === undefined && verify_token === undefined) {
      // Empty body: remove override
      const updated = upsertWaba({
        wabaId,
        overrideCallbackUri: "",
        verifyToken: "",
      });
      return res.json({
        success: true,
        waba: updated,
      });
    }

    const updated = upsertWaba({
      wabaId,
      overrideCallbackUri: override_callback_uri,
      verifyToken: verify_token,
    });

    return res.json({ success: true, waba: updated });
  });

  router.get("/wabas/:wabaId/subscribed-apps", (req: Request, res: Response) => {
    const { wabaId } = req.params;
    if (!wabaId) {
      return res.status(400).json({ error: "wabaId_required" });
    }
    const waba = getWaba(wabaId);
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

  // Phone-number-level overrides
  router.post("/:id/webhook-configuration", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const { webhook_configuration } = req.body ?? {};
    if (!webhook_configuration) {
      return res.status(400).json({ error: "webhook_configuration_required" });
    }

    const { override_callback_uri, verify_token } = webhook_configuration;

    const updated = upsertPhoneNumber({
      id,
      displayPhoneNumber: "",
      webhookConfiguration: {
        overrideCallbackUri: override_callback_uri,
        verifyToken: verify_token,
      },
    });

    return res.json({ success: true, phone: updated });
  });

  router.get("/:id/webhook-configuration", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "phone_id_required" });
    }

    const phone = getPhoneNumber(id);
    if (!phone) {
      return res.status(404).json({ error: "phone_not_found" });
    }

    const waba = phone.wabaId ? getWaba(phone.wabaId) : undefined;

    return res.json({
      webhook_configuration: {
        phone_number: phone.webhookConfiguration?.overrideCallbackUri ?? null,
        whatsapp_business_account: waba?.overrideCallbackUri ?? null,
        application: null,
      },
      id: phone.id,
    });
  });

  return router;
};

export default createPhoneNumbersRouter;
