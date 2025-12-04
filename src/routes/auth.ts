import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "../config";

export const createAuthRouter = (): Router => {
  const router = Router();

  router.post("/token", (req: Request, res: Response) => {
    const config = getConfig();
    const { sub = "sandbox-client", scope = "sandbox:full", expiresIn = "1h" } =
      req.body || {};

    const payload: jwt.JwtPayload = {
      sub,
      scope,
    };

    const token = jwt.sign(payload, config.auth.jwtSecret, {
      issuer: config.auth.jwtIssuer,
      audience: config.auth.jwtAudience,
      expiresIn,
    });

    res.json({
      token,
      payload: {
        ...payload,
        iss: config.auth.jwtIssuer,
        aud: config.auth.jwtAudience,
      },
      hint: {
        authorizationHeader: `Authorization: Bearer ${token}`,
      },
    });
  });

  return router;
};

export default createAuthRouter;

