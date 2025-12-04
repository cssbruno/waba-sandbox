import { Router, Request, Response } from "express";
import {
  evaluatePolicyForWaId,
  getContactPolicy,
  listContactPolicies,
  upsertContactPolicy,
} from "../state/policy";

export const createPolicyRouter = (): Router => {
  const router = Router();

  router.get("/contacts", (_req: Request, res: Response) => {
    res.json({ contacts: listContactPolicies() });
  });

  router.get("/contacts/:waId", (req: Request, res: Response) => {
    const { waId } = req.params;
    if (!waId) {
      return res.status(400).json({ error: "waId_required" });
    }
    const contact = getContactPolicy(waId);
    if (!contact) {
      return res.status(404).json({ error: "contact_not_found" });
    }
    return res.json(contact);
  });

  router.put("/contacts/:waId", (req: Request, res: Response) => {
    const { waId } = req.params;
    if (!waId) {
      return res.status(400).json({ error: "waId_required" });
    }
    const { label, status, note } = req.body ?? {};
    const policy = upsertContactPolicy({
      waId,
      label,
      status,
      note,
    });
    return res.json(policy);
  });

  router.get("/evaluate/:waId", (req: Request, res: Response) => {
    const { waId } = req.params;
    if (!waId) {
      return res.status(400).json({ error: "waId_required" });
    }
    const evaluation = evaluatePolicyForWaId(waId);
    return res.json(evaluation);
  });

  return router;
};

export default createPolicyRouter;
