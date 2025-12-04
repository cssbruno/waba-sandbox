import { Router, Request, Response } from "express";
import { listEvents, subscribe } from "../state/eventStore";

export const createEventsRouter = (): Router => {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.json({ events: listEvents() });
  });

  // Server-Sent Events stream for real-time updates
  router.get("/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (eventName: string, data: unknown) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send current snapshot
    send("bootstrap", { events: listEvents() });

    const unsubscribe = subscribe((event) => {
      send("event", event);
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  return router;
};

export default createEventsRouter;

