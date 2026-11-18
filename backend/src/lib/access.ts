import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "../db";
import { exams, questions } from "../db/schema";
import type { AuthUser } from "./auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export type ExamAccessRow = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  createdBy: string;
};

/**
 * Admin melihat seluruh data. Guru hanya melihat baris miliknya.
 * `created_by` pada ujian selalu terisi saat ujian dibuat.
 */
export function examScopeCondition(user: AuthUser): SQL | undefined {
  return user.role === "admin" ? undefined : eq(exams.createdBy, user.sub);
}

/**
 * Bank soal bersama (`created_by` NULL) terlihat oleh semua guru, tetapi hanya
 * admin yang boleh mengubahnya. Soal buatan guru hanya terlihat oleh pemiliknya.
 */
export function questionScopeCondition(user: AuthUser): SQL | undefined {
  if (user.role === "admin") return undefined;
  return or(isNull(questions.createdBy), eq(questions.createdBy, user.sub));
}

export function canManageQuestion(
  createdBy: string | null,
  user: AuthUser,
): boolean {
  if (user.role === "admin") return true;
  return createdBy !== null && createdBy === user.sub;
}

/** Guru boleh melihat soal miliknya dan bank soal bersama. */
export function canViewQuestion(
  createdBy: string | null,
  user: AuthUser,
): boolean {
  if (user.role === "admin") return true;
  return createdBy === null || createdBy === user.sub;
}

/** Mengambil ujian yang boleh diakses user, atau null jika tidak ada. */
export async function findExamForUser(
  examId: string,
  user: AuthUser,
  tx?: Tx,
): Promise<ExamAccessRow | null> {
  const executor: Executor = tx ?? db;
  const [row] = await executor
    .select({
      id: exams.id,
      title: exams.title,
      status: exams.status,
      createdBy: exams.createdBy,
    })
    .from(exams)
    .where(and(eq(exams.id, examId), examScopeCondition(user)))
    .limit(1);

  return row ?? null;
}

/**
 * Menyaring ID soal yang boleh dipasang ke ujian oleh user.
 * Guru hanya boleh memakai soal miliknya atau bank soal bersama.
 */
export async function filterVisibleQuestionIds(
  questionIds: string[],
  user: AuthUser,
  tx?: Tx,
): Promise<Set<string>> {
  if (questionIds.length === 0) return new Set();

  const executor: Executor = tx ?? db;
  const rows = await executor
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        inArray(questions.id, questionIds),
        questionScopeCondition(user),
      ),
    );

  return new Set(rows.map((row) => row.id));
}
