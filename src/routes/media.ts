import { Router, Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";

const mediaDir = path.join(__dirname, "..", "..", "media");

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

export const createMediaRouter = (): Router => {
  const router = Router();

  // List locally hosted media files (filenames only)
  router.get("/list", (_req: Request, res: Response) => {
    try {
      const files = fs.readdirSync(mediaDir).filter((f) => !f.startsWith("."));
      return res.json({ files });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[sandbox] media list failed", err);
      return res.status(500).json({ error: "failed_to_list_media" });
    }
  });

  // Download a remote asset and host it under /media (static) for sandbox usage.
  router.post("/fetch", async (req: Request, res: Response) => {
    const { url, filename } = req.body ?? {};

    if (typeof url !== "string" || !isHttpUrl(url)) {
      return res.status(400).json({ error: "url_http_or_https_required" });
    }

    let name = typeof filename === "string" && filename.trim()
      ? filename.trim()
      : "";

    try {
      const parsed = new URL(url);
      if (!name) {
        const base = path.basename(parsed.pathname || "");
        name = base || `media_${Date.now()}`;
      }
    } catch {
      // fallback to timestamp
      if (!name) {
        name = `media_${Date.now()}`;
      }
    }

    // Basic sanitization to avoid traversal
    name = name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const destPath = path.join(mediaDir, name);

    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        validateStatus: (status) => status >= 200 && status < 400,
      });

      fs.writeFileSync(destPath, Buffer.from(response.data));
      const stats = fs.statSync(destPath);

      return res.json({
        success: true,
        file: {
          name,
          size: stats.size,
        },
        url: `/media/${name}`,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[sandbox] media fetch failed", err);
      return res.status(400).json({ error: "failed_to_fetch_or_save_media" });
    }
  });

  return router;
};

export default createMediaRouter;
