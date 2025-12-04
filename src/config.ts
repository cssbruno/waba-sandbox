export interface AuthConfig {
  mode: "none" | "jwt";
  /**
   * Shared secret for signing and verifying JWTs in this sandbox.
   * This is NOT meant for production; it only exists to simulate auth flows.
   */
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
}

export interface RuntimeConfig {
  verifyToken: string;
  targetWebhookUrl: string | null;
  auth: AuthConfig;
  webhookAppSecret?: string | null;
}

const runtimeConfig: RuntimeConfig = {
  verifyToken: "sandbox-verify-token",
  targetWebhookUrl: null,
  auth: {
    mode: "none",
    jwtSecret: "sandbox-secret",
    jwtIssuer: "waba-sandbox",
    jwtAudience: "sandbox-client",
  },
  webhookAppSecret: process.env.WHATSAPP_APP_SECRET ?? null,
};

export const getConfig = (): RuntimeConfig => runtimeConfig;

export const updateConfig = (patch: Partial<RuntimeConfig>): RuntimeConfig => {
  if (typeof patch.verifyToken === "string") {
    runtimeConfig.verifyToken = patch.verifyToken;
  }

  if (
    typeof patch.targetWebhookUrl === "string" ||
    patch.targetWebhookUrl === null
  ) {
    runtimeConfig.targetWebhookUrl = patch.targetWebhookUrl;
  }

  if (
    patch.webhookAppSecret === null ||
    typeof patch.webhookAppSecret === "string"
  ) {
    runtimeConfig.webhookAppSecret = patch.webhookAppSecret;
  }

  if (patch.auth && typeof patch.auth === "object") {
    const authPatch = patch.auth;
    if (authPatch.mode === "none" || authPatch.mode === "jwt") {
      runtimeConfig.auth.mode = authPatch.mode;
    }
    if (typeof authPatch.jwtSecret === "string" && authPatch.jwtSecret) {
      runtimeConfig.auth.jwtSecret = authPatch.jwtSecret;
    }
    if (typeof authPatch.jwtIssuer === "string" && authPatch.jwtIssuer) {
      runtimeConfig.auth.jwtIssuer = authPatch.jwtIssuer;
    }
    if (typeof authPatch.jwtAudience === "string" && authPatch.jwtAudience) {
      runtimeConfig.auth.jwtAudience = authPatch.jwtAudience;
    }
  }

  return runtimeConfig;
};
