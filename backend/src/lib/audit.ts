import { randomUUID } from "node:crypto";
import { db } from "../db";
import { systemEvents } from "../db/schema";

export type SystemEventInput = {
  actorId: string | null;
  actorUsername: string;
  action: string;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
};

/**
 * Pencatatan audit bersifat best-effort: kegagalan menulis log tidak boleh
 * menggagalkan operasi utama (mis. backup).
 */
export async function logSystemEvent(input: SystemEventInput): Promise<void> {
  try {
    await db.insert(systemEvents).values({
      id: randomUUID(),
      actorId: input.actorId,
      actorUsername: input.actorUsername,
      action: input.action,
      detail: input.detail ?? null,
      ipAddress: input.ip ?? null,
    });
  } catch (error) {
    console.error("[audit] gagal menyimpan event", error);
  }
}
