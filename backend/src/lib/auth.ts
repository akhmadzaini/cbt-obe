import { createHash } from "node:crypto";
import { jwt } from "@elysiajs/jwt";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { env } from "../env";

export type AuthUser = {
  sub: string;
  role: "admin" | "teacher" | "student";
  ua: string;
};

export const jwtPlugin = jwt({ name: "jwt", secret: env.jwtSecret });

export function deviceFingerprint(userAgent: string, ip: string): string {
  const raw = env.bindIp ? `${userAgent}|${ip}` : userAgent;
  return createHash("sha256").update(raw).digest("hex");
}

type RequestLike = {
  headers: { get(name: string): string | null };
};

type ServerLike = {
  requestIP?: (request: Request) => { address?: string } | null;
} | null;

export function getClientIp(request: RequestLike, server: ServerLike): string {
  if (env.trustProxy) {
    // Frontend nginx menetapkan X-Real-IP dari $remote_addr setelah real_ip,
    // sehingga lebih sulit dipalsukan dibanding X-Forwarded-For.
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();

    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
  }
  try {
    return server?.requestIP?.(request as unknown as Request)?.address ?? "0.0.0.0";
  } catch {
    return "0.0.0.0";
  }
}

type AuthContext = {
  headers: Record<string, string | undefined>;
  request: Request;
  server: ServerLike;
  jwt: {
    verify: (token: string) => Promise<false | Record<string, unknown>>;
  };
};

/**
 * Memvalidasi Bearer token + device binding (User-Agent, opsional IP).
 * Mengembalikan null jika token tidak valid atau device berbeda.
 */
export async function authenticate(
  context: AuthContext,
): Promise<AuthUser | null> {
  const header =
    context.headers.authorization ?? context.headers.Authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;

  const payload = await context.jwt.verify(header.slice("Bearer ".length));
  if (!payload) return null;

  const userAgent = context.headers["user-agent"] ?? "";
  const ip = getClientIp(context.request, context.server);
  const expected = deviceFingerprint(userAgent, ip);

  if (payload.ua !== expected) return null;
  if (typeof payload.sub !== "string") return null;

  // Pastikan akun masih ada dan aktif. Ini membuat penonaktifan/penghapusan
  // peserta langsung mencabut akses token yang masih tersimpan di browser.
  const [account] = await db
    .select({ isActive: users.isActive, role: users.role })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  if (!account || !account.isActive) return null;

  return {
    sub: payload.sub,
    role: account.role,
    ua: String(payload.ua),
  };
}

export function requireRole(
  user: AuthUser | null,
  roles: AuthUser["role"][],
): user is AuthUser {
  return Boolean(user && roles.includes(user.role));
}
