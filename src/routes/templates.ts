import { Router, Request, Response } from "express";
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  listTemplates,
  updateTemplate,
} from "../state/templates";

export const createTemplatesRouter = (): Router => {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.json({ templates: listTemplates() });
  });

  router.post("/", (req: Request, res: Response) => {
    const { name, languageCode, category, bodyText, headerText, footerText } =
      req.body ?? {};

    if (
      typeof name !== "string" ||
      typeof languageCode !== "string" ||
      typeof bodyText !== "string"
    ) {
      return res.status(400).json({
        error: "name_languageCode_and_bodyText_required",
      });
    }

    const tpl = createTemplate({
      name,
      languageCode,
      category,
      bodyText,
      headerText,
      footerText,
      status: "APPROVED",
    });

    return res.status(201).json(tpl);
  });

  router.put("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id_required" });
    }
    const tpl = updateTemplate(id, req.body ?? {});
    if (!tpl) {
      return res.status(404).json({ error: "template_not_found" });
    }
    return res.json(tpl);
  });

  router.delete("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id_required" });
    }
    const deleted = deleteTemplate(id);
    if (!deleted) {
      return res.status(404).json({ error: "template_not_found" });
    }
    return res.json({ success: true });
  });

  router.get("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id_required" });
    }
    const tpl = getTemplateById(id);
    if (!tpl) {
      return res.status(404).json({ error: "template_not_found" });
    }
    return res.json(tpl);
  });

  return router;
};

export default createTemplatesRouter;
