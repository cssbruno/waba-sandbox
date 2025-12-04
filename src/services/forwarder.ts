import axios from "axios";
import crypto from "crypto";
import { getConfig } from "../config";
import { WabaWebhookPayload } from "../types/waba";

export interface ForwardResult {
  status: number;
  data: unknown;
  headers: Record<string, unknown>;
}

export class WebhookForwarder {
  constructor(
    private readonly targetUrl: string,
    private readonly appSecret?: string
  ) {}

  async forward(
    payload: WabaWebhookPayload,
    opts?: { appSecret?: string | undefined }
  ): Promise<ForwardResult> {
    const body = JSON.stringify(payload);

    const config = getConfig();
    const secret =
      opts?.appSecret ||
      this.appSecret ||
      config.webhookAppSecret ||
      process.env.WHATSAPP_APP_SECRET;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (secret) {
      const sig = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");
      headers["X-Hub-Signature-256"] = `sha256=${sig}`;
    }

    const response = await axios.post(this.targetUrl, body, {
      headers,
      timeout: 10_000,
      validateStatus: () => true,
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers as Record<string, unknown>,
    };
  }
}
