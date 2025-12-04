import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "../config";

export const requireSandboxAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const config = getConfig();

  if (config.auth.mode === "none") {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({
      error: "missing_authorization",
      message: "Expected Authorization: Bearer <token>",
    });
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret, {
      issuer: config.auth.jwtIssuer,
      audience: config.auth.jwtAudience,
    });
    (req as any).sandboxAuth = {
      mode: config.auth.mode,
      token,
      claims: decoded,
    };
    next();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid or expired token";
    res.status(401).json({
      error: "invalid_token",
      message,
    });
  }
};

