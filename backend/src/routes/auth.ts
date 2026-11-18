import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { deviceFingerprint, getClientIp } from "../lib/auth";
import { authPlugin } from "../lib/auth-plugin";
import { validateNewPassword } from "../lib/participant-validation";
import {
  applyRateLimitHeaders,
  checkLoginRateLimit,
  RATE_LIMITS,
  rateLimitMessage,
  resetLoginUsernameLimit,
} from "../lib/rate-limit";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(authPlugin)
  .post(
    "/login",
    async ({ body, jwt, request, server, status, set }) => {
      const ip = getClientIp(request, server);
      const limit = checkLoginRateLimit(ip, body.username);
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, body.username))
        .limit(1);

      if (!user || !user.isActive) {
        return status(401, { error: "Username atau password salah." });
      }

      const valid = await Bun.password.verify(
        body.password,
        user.passwordHash,
      );
      if (!valid) {
        return status(401, { error: "Username atau password salah." });
      }

      resetLoginUsernameLimit(body.username);

      const userAgent = request.headers.get("user-agent") ?? "";
      const token = await jwt.sign({
        sub: user.id,
        role: user.role,
        ua: deviceFingerprint(userAgent, ip),
      });

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
        },
      };
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    },
  )
  .post(
    "/change-password",
    async ({ body, user: authUser, status }) => {
      const [account] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, authUser.sub))
        .limit(1);
      if (!account) return status(401, { error: "Unauthorized" });

      if (body.currentPassword === body.newPassword) {
        return status(400, {
          error: "Password baru harus berbeda dari password saat ini.",
        });
      }

      const valid = await Bun.password.verify(
        body.currentPassword,
        account.passwordHash,
      );
      if (!valid) {
        return status(400, { error: "Password saat ini salah." });
      }

      const passwordError = validateNewPassword(body.newPassword);
      if (passwordError) return status(400, { error: passwordError });

      await db
        .update(users)
        .set({
          passwordHash: await Bun.password.hash(body.newPassword),
          updatedAt: new Date(),
        })
        .where(eq(users.id, account.id));

      return { ok: true };
    },
    {
      auth: {
        rateLimit: { name: "password-change", ...RATE_LIMITS.passwordChange },
      },
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String(),
      }),
    },
  )
  .get(
    "/me",
    async ({ user: authUser, status }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, authUser.sub))
        .limit(1);

      if (!user) return status(401, { error: "Unauthorized" });

      return {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
        },
      };
    },
    { auth: true },
  );
