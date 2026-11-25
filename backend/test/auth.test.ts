import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/lib/token.js";
import {
  ChangePasswordSchema,
  LoginSchema,
  BootstrapAdminSchema,
} from "../src/modules/auth/auth.schema.js";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_EMAIL = "admin@example.com";
const CURRENT_PASSWORD = "CorrectHorseBattery!92";
const NEW_PASSWORD = "NewCorrectHorseBattery!73";

const mockState = vi.hoisted(() => ({
  users: [] as Array<Record<string, any>>,
  sessions: [] as Array<Record<string, any>>,
}));

vi.mock("../src/config/prisma.js", () => {
  const database: any = {};
  const project = (
    record: Record<string, any>,
    select?: Record<string, any>,
  ) =>
    select
      ? Object.fromEntries(
          Object.keys(select)
            .filter((key) => select[key] === true)
            .map((key) => [key, record[key]]),
        )
      : record;

  database.user = {
    count: vi.fn(async () => mockState.users.length),
    create: vi.fn(async ({ data, select }: any) => {
      const now = new Date();
      const user = {
        id: ADMIN_ID,
        role: "ADMIN",
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      mockState.users.push(user);
      return project(user, select);
    }),
    findUnique: vi.fn(async ({ where, select }: any) => {
      const user = mockState.users.find(
        (user) =>
          (where.id === undefined || user.id === where.id) &&
          (where.email === undefined || user.email === where.email),
      );
      return user ? project(user, select) : null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const user = mockState.users.find((item) => item.id === where.id);
      if (!user) throw new Error("Mock user does not exist");
      Object.assign(user, data, { updatedAt: new Date() });
      return user;
    }),
  };

  database.refreshSession = {
    create: vi.fn(async ({ data }: any) => {
      const session = {
        id: `session-${mockState.sessions.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      mockState.sessions.push(session);
      return session;
    }),
    findUnique: vi.fn(
      async ({ where }: any) =>
        mockState.sessions.find((session) => session.token === where.token) ??
        null,
    ),
    deleteMany: vi.fn(async ({ where }: any) => {
      const matches = (session: Record<string, any>) =>
        (where.id === undefined || session.id === where.id) &&
        (where.userId === undefined || session.userId === where.userId) &&
        (where.token === undefined || session.token === where.token) &&
        (where.expiresAt?.gt === undefined ||
          session.expiresAt > where.expiresAt.gt);
      const before = mockState.sessions.length;
      mockState.sessions = mockState.sessions.filter(
        (session) => !matches(session),
      );
      return { count: before - mockState.sessions.length };
    }),
  };

  database.$transaction = vi.fn(async (operation: any) =>
    typeof operation === "function"
      ? operation(database)
      : Promise.all(operation),
  );

  return { prisma: database };
});

vi.mock("../src/core/Logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("../src/lib/hash.js", () => ({
  hashPassword: vi.fn(async (password: string) => `test-hash:${password}`),
  checkPassword: vi.fn(
    async (password: string, passwordHash: string) =>
      passwordHash === `test-hash:${password}`,
  ),
}));

async function seedAdmin(
  options: { isActive?: boolean; password?: string } = {},
) {
  const passwordHash = `test-hash:${options.password ?? CURRENT_PASSWORD}`;
  const now = new Date();
  const user = {
    id: ADMIN_ID,
    name: "Test Administrator",
    email: ADMIN_EMAIL,
    passwordHash,
    role: "ADMIN",
    isActive: options.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  mockState.users.push(user);
  return user;
}

async function loginWithAgent() {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/auth/login")
    .send({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD });
  return { agent, response };
}

function cookiePair(response: any): string {
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookie.split(";")[0];
}

beforeEach(() => {
  mockState.users.length = 0;
  mockState.sessions.length = 0;
});

describe("auth input validation", () => {
  it("normalizes bootstrap email and trims the admin name", () => {
    const result = BootstrapAdminSchema.parse({
      name: "  Main Admin  ",
      email: "  ADMIN@Example.com ",
      password: CURRENT_PASSWORD,
    });

    expect(result.name).toBe("Main Admin");
    expect(result.email).toBe("admin@example.com");
  });

  it("rejects weak passwords and additional bootstrap fields", () => {
    expect(
      BootstrapAdminSchema.safeParse({
        name: "Admin",
        email: ADMIN_EMAIL,
        password: "short",
      }).success,
    ).toBe(false);
    expect(
      BootstrapAdminSchema.safeParse({
        name: "Admin User",
        email: ADMIN_EMAIL,
        password: CURRENT_PASSWORD,
        role: "SUPER_ADMIN",
      }).success,
    ).toBe(false);
  });

  it("validates login email/password and rejects unknown fields", () => {
    expect(LoginSchema.safeParse({ email: "bad", password: "x" }).success).toBe(
      false,
    );
    expect(
      LoginSchema.safeParse({
        email: ADMIN_EMAIL,
        password: CURRENT_PASSWORD,
        isAdmin: true,
      }).success,
    ).toBe(false);
  });

  it("requires a strong, different new password", () => {
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: CURRENT_PASSWORD,
        newPassword: CURRENT_PASSWORD,
      }).success,
    ).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).success,
    ).toBe(true);
  });
});

describe("password and token helpers", () => {
  it("creates distinct access and refresh tokens with the expected subjects", () => {
    const accessToken = createAccessToken(ADMIN_ID);
    const refreshToken = createRefreshToken(ADMIN_ID);

    expect(verifyAccessToken(accessToken)).toEqual({ userId: ADMIN_ID });
    expect(verifyRefreshToken(refreshToken).userId).toBe(ADMIN_ID);
    expect(() => verifyAccessToken(refreshToken)).toThrow();
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it("rejects tampered tokens and hashes refresh tokens deterministically", () => {
    const token = createRefreshToken(ADMIN_ID);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(() => verifyRefreshToken(tampered)).toThrow();
    expect(hashRefreshToken(token)).toHaveLength(64);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });
});

describe("authentication API", () => {
  it("bootstraps one admin, sets a secure refresh cookie, and stores only its hash", async () => {
    const response = await request(app)
      .post("/api/auth/bootstrap")
      .set("x-admin-bootstrap-key", process.env.ADMIN_BOOTSTRAP_KEY!)
      .send({
        name: "Test Administrator",
        email: ADMIN_EMAIL,
        password: CURRENT_PASSWORD,
      });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      role: "ADMIN",
    });
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(mockState.users).toHaveLength(1);
    expect(mockState.sessions).toHaveLength(1);
    expect(mockState.sessions[0].token).toHaveLength(64);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(response.headers["set-cookie"][0]).toContain("Path=/api/auth");
  });

  it("blocks bootstrap without its key, from an untrusted origin, and after the first admin", async () => {
    const body = {
      name: "Test Administrator",
      email: ADMIN_EMAIL,
      password: CURRENT_PASSWORD,
    };
    const noKey = await request(app).post("/api/auth/bootstrap").send(body);
    expect(noKey.status).toBe(403);
    expect(mockState.users).toHaveLength(0);

    const wrongOrigin = await request(app)
      .post("/api/auth/bootstrap")
      .set("origin", "https://untrusted.example")
      .set("x-admin-bootstrap-key", process.env.ADMIN_BOOTSTRAP_KEY!)
      .send(body);
    expect(wrongOrigin.status).toBe(403);
    expect(mockState.users).toHaveLength(0);

    await seedAdmin();
    const repeated = await request(app)
      .post("/api/auth/bootstrap")
      .set("x-admin-bootstrap-key", process.env.ADMIN_BOOTSTRAP_KEY!)
      .send(body);
    expect(repeated.status).toBe(409);
    expect(mockState.users).toHaveLength(1);
  });

  it("returns field validation errors for malformed bootstrap and login requests", async () => {
    const bootstrap = await request(app)
      .post("/api/auth/bootstrap")
      .set("x-admin-bootstrap-key", process.env.ADMIN_BOOTSTRAP_KEY!)
      .send({ name: "A", email: "bad", password: "weak" });
    expect(bootstrap.status).toBe(400);
    expect(bootstrap.body.details).toEqual(expect.any(Array));

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "bad", password: "" });
    expect(login.status).toBe(400);
    expect(login.body.details).toEqual(expect.any(Array));
  });

  it("logs in with a normalized email and rejects bad credentials/inactive accounts uniformly", async () => {
    await seedAdmin();
    const goodLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: " ADMIN@EXAMPLE.COM ", password: CURRENT_PASSWORD });
    expect(goodLogin.status).toBe(200);
    expect(goodLogin.body.user.email).toBe(ADMIN_EMAIL);
    expect(goodLogin.body.user.passwordHash).toBeUndefined();
    expect(goodLogin.headers["set-cookie"][0]).toContain("ahati_refresh=");
    expect(mockState.sessions).toHaveLength(1);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: NEW_PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.message).toBe("Email or password is incorrect");

    mockState.users[0].isActive = false;
    const inactive = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD });
    expect(inactive.status).toBe(401);
    expect(inactive.body.message).toBe(wrongPassword.body.message);
  });

  it("protects /me and returns only safe active-user fields", async () => {
    await seedAdmin();
    const anonymous = await request(app).get("/api/auth/me");
    expect(anonymous.status).toBe(401);

    const token = createAccessToken(ADMIN_ID);
    const response = await request(app)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      role: "ADMIN",
      isActive: true,
    });
    expect(response.body.user.passwordHash).toBeUndefined();

    mockState.users[0].isActive = false;
    const inactive = await request(app)
      .get("/api/auth/me")
      .set("authorization", `Bearer ${token}`);
    expect(inactive.status).toBe(401);
  });

  it("rotates refresh tokens and rejects replay of the previous token", async () => {
    await seedAdmin();
    const { agent, response: loginResponse } = await loginWithAgent();
    expect(loginResponse.status).toBe(200);
    const oldCookie = cookiePair(loginResponse);
    const oldHash = mockState.sessions[0].token;

    const refreshed = await agent.post("/api/auth/refresh").send({});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(mockState.sessions).toHaveLength(1);
    expect(mockState.sessions[0].token).not.toBe(oldHash);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("cookie", oldCookie);
    expect(replay.status).toBe(401);
    expect(mockState.sessions).toHaveLength(1);
  });

  it("rejects missing, invalid, expired, and inactive-user refresh sessions", async () => {
    const missing = await request(app).post("/api/auth/refresh");
    expect(missing.status).toBe(401);

    await seedAdmin();
    const expiredToken = createRefreshToken(ADMIN_ID);
    const expiredHash = hashRefreshToken(expiredToken);
    mockState.sessions.push({
      id: "expired-session",
      userId: ADMIN_ID,
      token: expiredHash,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const expired = await request(app)
      .post("/api/auth/refresh")
      .set("cookie", `ahati_refresh=${expiredToken}`);
    expect(expired.status).toBe(401);

    const inactiveToken = createRefreshToken(ADMIN_ID);
    mockState.sessions.push({
      id: "inactive-session",
      userId: ADMIN_ID,
      token: hashRefreshToken(inactiveToken),
      expiresAt: verifyRefreshToken(inactiveToken).expiresAt,
    });
    mockState.users[0].isActive = false;
    const inactive = await request(app)
      .post("/api/auth/refresh")
      .set("cookie", `ahati_refresh=${inactiveToken}`);
    expect(inactive.status).toBe(401);
    expect(mockState.sessions).toHaveLength(0);
  });

  it("logs out the current session and revokes all sessions when requested", async () => {
    await seedAdmin();
    const first = await loginWithAgent();
    const firstCookie = cookiePair(first.response);
    await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD });
    expect(mockState.sessions).toHaveLength(2);

    const logoutAll = await first.agent
      .post("/api/auth/logout-all")
      .set("authorization", `Bearer ${first.response.body.accessToken}`);
    expect(logoutAll.status).toBe(204);
    expect(mockState.sessions).toHaveLength(0);

    const oldCookie = await request(app)
      .post("/api/auth/refresh")
      .set("cookie", firstCookie);
    expect(oldCookie.status).toBe(401);

    const nextLogin = await loginWithAgent();
    const currentCookie = cookiePair(nextLogin.response);
    const logout = await nextLogin.agent.post("/api/auth/logout");
    expect(logout.status).toBe(204);
    expect(mockState.sessions).toHaveLength(0);
    expect(logout.headers["set-cookie"][0]).toContain("ahati_refresh=");
    expect(currentCookie).toContain("ahati_refresh=");
  });

  it("requires access authentication to revoke all sessions", async () => {
    const response = await request(app).post("/api/auth/logout-all");
    expect(response.status).toBe(401);
  });

  it("changes password, invalidates all refresh sessions, and permits the new password", async () => {
    await seedAdmin();
    const { agent, response: loginResponse } = await loginWithAgent();
    await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD });
    expect(mockState.sessions).toHaveLength(2);

    const changed = await agent
      .post("/api/auth/change-password")
      .set("authorization", `Bearer ${loginResponse.body.accessToken}`)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);
    expect(mockState.sessions).toHaveLength(0);

    const oldPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD });
    const newPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: NEW_PASSWORD });
    expect(oldPassword.status).toBe(401);
    expect(newPassword.status).toBe(200);
  });

  it("rejects wrong current passwords and malformed password changes", async () => {
    await seedAdmin();
    const token = createAccessToken(ADMIN_ID);
    const wrongCurrent = await request(app)
      .post("/api/auth/change-password")
      .set("authorization", `Bearer ${token}`)
      .send({ currentPassword: NEW_PASSWORD, newPassword: CURRENT_PASSWORD });
    expect(wrongCurrent.status).toBe(401);

    const malformed = await request(app)
      .post("/api/auth/change-password")
      .set("authorization", `Bearer ${token}`)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: "short" });
    expect(malformed.status).toBe(400);
  });
});
