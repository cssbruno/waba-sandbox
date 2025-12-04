import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { createWebhookRouter } from "./routes/webhook";
import { createSimulateRouter } from "./routes/simulate";
import { getConfig } from "./config";
import { createConfigRouter } from "./routes/config";
import { createEventsRouter } from "./routes/events";
import { createPolicyRouter } from "./routes/policy";
import { createAuthRouter } from "./routes/auth";
import { createPhoneNumbersRouter } from "./routes/phoneNumbers";
import { createTemplatesRouter } from "./routes/templates";
import { createGraphRouter } from "./routes/graph";
import { createMarketingRouter } from "./routes/marketing";
import { requireSandboxAuth } from "./middleware/auth";

const app = express();
const PORT = 3737;

app.use(cors());
app.use(bodyParser.json());

// Static UI
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// Static media used in simulated messages (for real downloads)
const mediaDir = path.join(__dirname, "..", "media");
app.use("/media", express.static(mediaDir));

// API routes
app.use("/api/auth", createAuthRouter());
app.use("/api/config", requireSandboxAuth, createConfigRouter());
app.use("/api/events", createEventsRouter());
app.use("/api/policy", requireSandboxAuth, createPolicyRouter());
app.use("/api/marketing", requireSandboxAuth, createMarketingRouter());
app.use("/api/templates", requireSandboxAuth, createTemplatesRouter());
app.use("/api/phone-numbers", requireSandboxAuth, createPhoneNumbersRouter());

// Health
app.get("/health", (_req, res) => {
  const config = getConfig();
  res.json({
    status: "ok",
    port: PORT,
    targetWebhookUrl: config.targetWebhookUrl,
  });
});

// Webhook endpoint that mimics WhatsApp
app.use("/webhook", createWebhookRouter());

// Simulation endpoints that send WhatsApp-style events to your app
app.use("/simulate", requireSandboxAuth, createSimulateRouter());

// Graph-style versioned endpoints (e.g. /v20.0/<ID>/...)
app.use("/:graphVersion", requireSandboxAuth, createGraphRouter());

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[sandbox] WABA sandbox running on http://localhost:${PORT}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[sandbox] Webhook endpoint (for verify/url): http://localhost:${PORT}/webhook`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[sandbox] Simulation endpoint: http://localhost:${PORT}/simulate/message`
  );
});
