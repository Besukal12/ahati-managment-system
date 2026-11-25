import { prisma } from "../../config/prisma.js";
import { ConflictError, UnauthorizedError } from "../../core/CustomError.js";
import { checkPassword, hashPassword } from "../../lib/hash.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
} from "../../lib/token.js";
import type {
  BootstrapAdminInput,
  ChangePasswordInput,
  LoginInput,
} from "./auth.schema.js";

type AuthDataClient = Pick<typeof prisma, "user" | "refreshSession">;

async function storeRefreshSession(
  tx: AuthDataClient,
  userId: string,
  refreshToken: string,
): Promise<void> {
  await tx.refreshSession.create({
    data: {
      userId,
      token: hashRefreshToken(refreshToken),
      expiresAt: verifyRefreshToken(refreshToken).expiresAt,
    },
  });
}

export async function bootstrapAdmin(data: BootstrapAdminInput) {
  const passwordHash = await hashPassword(data.password);

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const tx = transaction as AuthDataClient;
        if ((await tx.user.count()) > 0)
          throw new ConflictError(
            "Initial administrator is already configured",
          );

        const user = await tx.user.create({
          data: { name: data.name, email: data.email, passwordHash },
          select: { id: true, name: true, email: true, role: true },
        });
        const refreshToken = createRefreshToken(user.id);
        await storeRefreshSession(tx, user.id, refreshToken);

        return {
          user,
          refreshToken,
          accessToken: createAccessToken(user.id),
        };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "P2002" || error.code === "P2034")
    )
      throw new ConflictError("Initial administrator is already configured");
    throw error;
  }
}

export async function login(data: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (
    !user ||
    !user.isActive ||
    !(await checkPassword(data.password, user.passwordHash))
  )
    throw new UnauthorizedError("Email or password is incorrect");

  const refreshToken = createRefreshToken(user.id);
  await storeRefreshSession(prisma, user.id, refreshToken);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    refreshToken,
    accessToken: createAccessToken(user.id),
  };
}

export async function rotateRefreshToken(token: string) {
  const { userId, expiresAt } = verifyRefreshToken(token);
  const tokenHash = hashRefreshToken(token);
  const [session, user] = await Promise.all([
    prisma.refreshSession.findUnique({ where: { token: tokenHash } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    }),
  ]);

  if (!user || !user.isActive) {
    await prisma.refreshSession.deleteMany({ where: { userId } });
    throw new UnauthorizedError("Authentication required");
  }

  const now = new Date();
  if (
    !session ||
    session.userId !== userId ||
    session.expiresAt <= now ||
    expiresAt <= now
  )
    throw new UnauthorizedError("Refresh token is invalid or expired");

  const nextToken = createRefreshToken(userId);
  await prisma.$transaction(async (tx) => {
    const authTx = tx as AuthDataClient;
    const removed = await authTx.refreshSession.deleteMany({
      where: { id: session.id, token: tokenHash, expiresAt: { gt: now } },
    });
    if (removed.count !== 1)
      throw new UnauthorizedError("Refresh token has already been used");
    await storeRefreshSession(authTx, userId, nextToken);
  });

  return {
    refreshToken: nextToken,
    accessToken: createAccessToken(userId),
  };
}

export async function logout(token?: string): Promise<void> {
  if (!token) return;
  await prisma.refreshSession.deleteMany({
    where: { token: hashRefreshToken(token) },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshSession.deleteMany({ where: { userId } });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user || !user.isActive)
    throw new UnauthorizedError("Authentication required");
  return user;
}

export async function changePassword(
  userId: string,
  data: ChangePasswordInput,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, isActive: true },
  });
  if (!user || !user.isActive)
    throw new UnauthorizedError("Authentication required");
  if (!(await checkPassword(data.currentPassword, user.passwordHash)))
    throw new UnauthorizedError("Current password is incorrect");

  const passwordHash = await hashPassword(data.newPassword);
  await prisma.$transaction(async (tx) => {
    const authTx = tx as AuthDataClient;
    await authTx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await authTx.refreshSession.deleteMany({ where: { userId: user.id } });
  });
}
