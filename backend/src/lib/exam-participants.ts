import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  examParticipants,
  examSessions,
  exams,
  users,
} from "../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BlockedParticipant = {
  userId: string;
  username: string;
  fullName: string;
  sessionCount: number;
};

export type ExamParticipantRow = {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  assigned: boolean;
  assignedAt: string | null;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  lastSessionAt: string | null;
};

export type ExamParticipantsPayload = {
  examId: string;
  assignedCount: number;
  participants: ExamParticipantRow[];
};

export class ExamParticipantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExamParticipantError";
  }
}

export class ExamParticipantConflictError extends Error {
  readonly blocked: BlockedParticipant[];

  constructor(message: string, blocked: BlockedParticipant[] = []) {
    super(message);
    this.name = "ExamParticipantConflictError";
    this.blocked = blocked;
  }
}

function uniqueIds(ids: string[]): string[] {
  return [
    ...new Set(
      ids.filter((id) => typeof id === "string" && id.trim().length > 0),
    ),
  ];
}

export async function validateParticipantIds(
  ids: string[],
): Promise<string[]> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return [];

  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, unique));

  if (rows.length !== unique.length) {
    throw new ExamParticipantError(
      "Ada peserta yang tidak ditemukan. Muat ulang daftar peserta.",
    );
  }
  if (rows.some((row) => row.role !== "student")) {
    throw new ExamParticipantError(
      "Hanya akun peserta yang dapat di-assign ke ujian.",
    );
  }

  return unique;
}

export async function insertExamParticipants(
  tx: Tx,
  examId: string,
  userIds: string[],
  assignedBy: string,
): Promise<void> {
  if (userIds.length === 0) return;

  await tx.insert(examParticipants).values(
    userIds.map((userId) => ({
      id: randomUUID(),
      examId,
      userId,
      assignedBy,
    })),
  );
}

export async function getExamParticipants(
  examId: string,
): Promise<ExamParticipantsPayload> {
  const students = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.role, "student"))
    .orderBy(asc(users.fullName))
    .limit(1000);

  const assignments = await db
    .select({
      userId: examParticipants.userId,
      assignedAt: examParticipants.assignedAt,
    })
    .from(examParticipants)
    .where(eq(examParticipants.examId, examId));

  const sessionRows = await db
    .select({
      userId: examSessions.userId,
      status: examSessions.status,
      startedAt: examSessions.startedAt,
      finishedAt: examSessions.finishedAt,
    })
    .from(examSessions)
    .where(eq(examSessions.examId, examId));

  const assignmentMap = new Map(
    assignments.map((row) => [row.userId, row.assignedAt]),
  );

  const statsByUser = new Map<
    string,
    {
      total: number;
      active: number;
      finished: number;
      lastAt: Date | null;
    }
  >();

  for (const session of sessionRows) {
    const stats = statsByUser.get(session.userId) ?? {
      total: 0,
      active: 0,
      finished: 0,
      lastAt: null,
    };
    stats.total += 1;
    if (session.status === "started" || session.status === "in_progress") {
      stats.active += 1;
    }
    if (session.status === "finished") {
      stats.finished += 1;
    }
    const candidate = session.finishedAt ?? session.startedAt;
    if (candidate && (!stats.lastAt || candidate > stats.lastAt)) {
      stats.lastAt = candidate;
    }
    statsByUser.set(session.userId, stats);
  }

  return {
    examId,
    assignedCount: assignments.length,
    participants: students.map((student) => {
      const stats = statsByUser.get(student.id);
      const assignedAt = assignmentMap.get(student.id);
      return {
        ...student,
        assigned: Boolean(assignedAt),
        assignedAt: assignedAt ? assignedAt.toISOString() : null,
        sessionCount: stats?.total ?? 0,
        activeSessionCount: stats?.active ?? 0,
        finishedSessionCount: stats?.finished ?? 0,
        lastSessionAt: stats?.lastAt ? stats.lastAt.toISOString() : null,
      };
    }),
  };
}

/**
 * Mengganti daftar peserta ujian. Peserta yang sudah memiliki sesi ujian tidak
 * boleh dilepas agar riwayat pengerjaan dan hasilnya tetap dapat diakses.
 */
export async function replaceExamParticipants(
  examId: string,
  userIds: string[],
  assignedBy: string,
): Promise<void> {
  const nextIds = await validateParticipantIds(userIds);
  const nextSet = new Set(nextIds);

  await db.transaction(async (tx) => {
    const [exam] = await tx
      .select({ id: exams.id, status: exams.status })
      .from(exams)
      .where(eq(exams.id, examId))
      .for("update");

    if (!exam) {
      throw new ExamParticipantError("Ujian tidak ditemukan.");
    }
    if (exam.status === "archived") {
      throw new ExamParticipantConflictError(
        "Ujian yang sudah diarsipkan tidak dapat diubah pesertanya.",
      );
    }

    const current = await tx
      .select({ userId: examParticipants.userId })
      .from(examParticipants)
      .where(eq(examParticipants.examId, examId));
    const currentSet = new Set(current.map((row) => row.userId));

    const removed = [...currentSet].filter((id) => !nextSet.has(id));
    if (removed.length > 0) {
      const sessionRows = await tx
        .select({ userId: examSessions.userId })
        .from(examSessions)
        .where(
          and(
            eq(examSessions.examId, examId),
            inArray(examSessions.userId, removed),
          ),
        );

      if (sessionRows.length > 0) {
        const sessionCounts = new Map<string, number>();
        for (const row of sessionRows) {
          sessionCounts.set(
            row.userId,
            (sessionCounts.get(row.userId) ?? 0) + 1,
          );
        }
        const blockedIds = [...sessionCounts.keys()];
        const userRows = await tx
          .select({
            id: users.id,
            username: users.username,
            fullName: users.fullName,
          })
          .from(users)
          .where(inArray(users.id, blockedIds));
        const blocked: BlockedParticipant[] = userRows.map((row) => ({
          userId: row.id,
          username: row.username,
          fullName: row.fullName,
          sessionCount: sessionCounts.get(row.id) ?? 0,
        }));

        throw new ExamParticipantConflictError(
          "Peserta yang sudah memiliki sesi ujian tidak dapat dilepas.",
          blocked,
        );
      }

      await tx
        .delete(examParticipants)
        .where(
          and(
            eq(examParticipants.examId, examId),
            inArray(examParticipants.userId, removed),
          ),
        );
    }

    const toAdd = nextIds.filter((id) => !currentSet.has(id));
    await insertExamParticipants(tx, examId, toAdd, assignedBy);
  });
}

export async function isAssignedToExam(
  examId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: examParticipants.id })
    .from(examParticipants)
    .where(
      and(
        eq(examParticipants.examId, examId),
        eq(examParticipants.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
