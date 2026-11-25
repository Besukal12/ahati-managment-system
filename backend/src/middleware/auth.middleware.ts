import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { UnauthorizedError } from "../core/CustomError.js";
import { verifyAccessToken } from "../lib/token.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
  if (!match) throw new UnauthorizedError("Authentication required");

  const { userId } = verifyAccessToken(match[1]);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive)
    throw new UnauthorizedError("Authentication required");

  req.auth = { userId: user.id };
  next();
}
