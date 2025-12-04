import { Router, Request, Response } from "express";
import { getConfig, updateConfig } from "../config";
import { addEvent } from "../state/eventStore";

export const createConfigRouter = (): Router => {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.json(getConfig());
  });

  router.put("/", (req: Request, res: Response) => {
    const before = getConfig();
    const updated = updateConfig(req.body ?? {});

    addEvent({
      direction: "system",
      type: "config.update",
      source: "config-api",
      payload: updated,
      meta: { before },
    });

    res.json(updated);
  });

  return router;
};

export default createConfigRouter;

