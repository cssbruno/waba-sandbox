import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { addEvent } from "../state/eventStore";

export const createWebhookRouter = (): Router => {
  const router = Router();

  // Verification endpoint (GET)
  router.get("/", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const config = getConfig();

    if (mode === "subscribe" && token === config.verifyToken) {
      if (typeof challenge === "string") {
        return res.status(200).send(challenge);
      }
      return res.status(200).send("OK");
    }

    return res.sendStatus(403);
  });

  // Receive webhooks (POST) - for debugging only
  router.post("/", (req: Request, res: Response) => {
    // eslint-disable-next-line no-console
    console.log(
      "[sandbox] Incoming webhook from client:",
      JSON.stringify(req.body, null, 2)
    );

    addEvent({
      direction: "inbound",
      type: "webhook.incoming",
      source: "webhook",
      payload: req.body,
    });

    return res.status(200).json({ status: "received" });
  });

  return router;
};
