import axios from "axios";
import { WabaWebhookPayload } from "../types/waba";

export interface ForwardResult {
  status: number;
  data: unknown;
  headers: Record<string, unknown>;
}

export class WebhookForwarder {
  constructor(private readonly targetUrl: string) {}

  async forward(payload: WabaWebhookPayload): Promise<ForwardResult> {
    const response = await axios.post(this.targetUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
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

