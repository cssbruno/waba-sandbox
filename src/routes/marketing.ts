import { Router, Request, Response } from "express";
import {
  evaluateMarketingEligibility,
  evaluateMarketingFrequency,
  getMarketingConfig,
  listMarketingContacts,
  listMarketingConversions,
  listMarketingSends,
  recordMarketingConversion,
  updateMarketingConfig,
  upsertMarketingContact,
} from "../state/marketing";

export const createMarketingRouter = (): Router => {
  const router = Router();

  router.get("/contacts", (_req: Request, res: Response) => {
    res.json({ contacts: listMarketingContacts() });
  });

  router.put("/contacts/:waId", (req: Request, res: Response) => {
    const { waId } = req.params;
    if (!waId) {
      return res.status(400).json({ error: "waId_required" });
    }

    const { status, source, note } = req.body ?? {};
    if (
      status !== undefined &&
      status !== "opted_in" &&
      status !== "opted_out" &&
      status !== "unknown"
    ) {
      return res.status(400).json({
        error: "status_must_be_opted_in_opted_out_or_unknown",
      });
    }

    const contact = upsertMarketingContact({
      waId,
      status,
      source,
      note,
    });

    return res.json(contact);
  });

  router.get("/eligibility/:waId", (req: Request, res: Response) => {
    const { waId } = req.params;
    if (!waId) {
      return res.status(400).json({ error: "waId_required" });
    }

    const eligibility = evaluateMarketingEligibility(waId);
    const frequency = evaluateMarketingFrequency({
      phoneId: "sandbox",
      to: waId,
    });

    return res.json({ eligibility, frequency });
  });

  router.get("/config", (_req: Request, res: Response) => {
    res.json(getMarketingConfig());
  });

  router.put("/config", (req: Request, res: Response) => {
    updateMarketingConfig(req.body ?? {});
    res.json(getMarketingConfig());
  });

  router.get("/sends", (_req: Request, res: Response) => {
    res.json({ sends: listMarketingSends() });
  });

  router.get("/conversions", (_req: Request, res: Response) => {
    res.json({ conversions: listMarketingConversions() });
  });

  router.post("/conversions", (req: Request, res: Response) => {
    const { waId, sendId, event, value, currency, metadata } = req.body ?? {};

    if (typeof waId !== "string" || typeof event !== "string" || !waId) {
      return res.status(400).json({
        error: "waId_and_event_required",
      });
    }

    const conversion = recordMarketingConversion({
      waId,
      sendId,
      event,
      value,
      currency,
      metadata,
    });

    return res.status(201).json(conversion);
  });

  return router;
};

export default createMarketingRouter;

