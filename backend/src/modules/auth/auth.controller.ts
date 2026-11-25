import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../core/AppError.js";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from "../../core/CustomError.js";
import { REFRESH_TOKEN_TTL_MS } from "../../lib/token.js";
import {
  BootstrapAdminSchema,
  ChangePasswordSchema,
  LoginSchema,
} from "./auth.schema.js";
import {
  bootstrapAdmin,
  changePassword,
  getCurrentUser,
  login,
  logout,
  logoutAll,
  rotateRefreshToken,
} from "./auth.service.js";

const refreshCookieName = "ahati_refresh";
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_TTL_MS,
};

function assertTrustedOrigin(req: Request): void {
  const origin = req.get("origin");
  if (!origin) return;

  try {
    const allowedOrigin = env.WEB_ORIGIN
      ? new URL(env.WEB_ORIGIN).origin
      : new URL(`${req.protocol}://${req.get("host")}`).origin;
    if (new URL(origin).origin !== allowedOrigin)
      throw new ForbiddenError("Untrusted request origin");
  } catch (error) {
    if (error instanceof ForbiddenError) throw error;
    throw new ForbiddenError("Untrusted request origin");
  }
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(refreshCookieName, token, refreshCookieOptions);
}

function validationError(issues: { path: PropertyKey[]; message: string }[]) {
  return new BadRequestError(
    "Invalid request data",
    issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}

function hasValidBootstrapKey(candidate: string | undefined): boolean {
  const expected = env.ADMIN_BOOTSTRAP_KEY;
  if (!candidate || !expected) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

export async function BootstrapAdminHandler(
  req: Request,
  res: Response,
): Promise<void> {
  assertTrustedOrigin(req);
  if (!hasValidBootstrapKey(req.get("x-admin-bootstrap-key")))
    throw new ForbiddenError("Administrator bootstrap is unavailable");

  const parsed = BootstrapAdminSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const result = await bootstrapAdmin(parsed.data);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({
    message: "Administrator account created",
    user: result.user,
    accessToken: result.accessToken,
  });
}

export async function LoginHandler(req: Request, res: Response): Promise<void> {
  assertTrustedOrigin(req);
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const result = await login(parsed.data);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    message: "Login successful",
    user: result.user,
    accessToken: result.accessToken,
  });
}

export async function RefreshTokenHandler(
  req: Request,
  res: Response,
): Promise<void> {
  assertTrustedOrigin(req);
  const token = req.cookies?.[refreshCookieName];
  if (typeof token !== "string") {
    clearRefreshCookie(res);
    throw new UnauthorizedError("Authentication required");
  }

  try {
    const result = await rotateRefreshToken(token);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ accessToken: result.accessToken });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401)
      clearRefreshCookie(res);
    throw error;
  }
}

export async function LogoutHandler(
  req: Request,
  res: Response,
): Promise<void> {
  assertTrustedOrigin(req);
  const token = req.cookies?.[refreshCookieName];
  await logout(typeof token === "string" ? token : undefined);
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function LogoutAllHandler(
  req: Request,
  res: Response,
): Promise<void> {
  assertTrustedOrigin(req);
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  await logoutAll(req.auth.userId);
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function GetCurrentUserHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  res.status(200).json({ user: await getCurrentUser(req.auth.userId) });
}

export async function ChangePasswordHandler(
  req: Request,
  res: Response,
): Promise<void> {
  assertTrustedOrigin(req);
  if (!req.auth) throw new UnauthorizedError("Authentication required");
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.issues);

  await changePassword(req.auth.userId, parsed.data);
  clearRefreshCookie(res);
  res.status(200).json({
    message: "Password changed. Please sign in again on your other devices.",
  });
}
