import { and, asc, eq, type SQL } from "drizzle-orm";
import { db, pool } from "./db";
import { examSessions, users } from "./db/schema";
import { recalculateSessionScores } from "./lib/recalc-scores";

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function main(): Promise<void> {
  const apply = hasFlag("--apply");
  const examId = argValue("--exam-id");
  const sessionId = argValue("--session-id");

  const conditions: SQL[] = [eq(examSessions.status, "finished")];
  if (examId) conditions.push(eq(examSessions.examId, examId));
  if (sessionId) conditions.push(eq(examSessions.id, sessionId));

  const rows = await db
    .select({
      id: examSessions.id,
      examId: examSessions.examId,
      username: users.username,
      fullName: users.fullName,
    })
    .from(examSessions)
    .innerJoin(users, eq(users.id, examSessions.userId))
    .where(and(...conditions))
    .orderBy(asc(examSessions.startedAt));

  console.log(
    `[recalc] mode=${apply ? "APPLY" : "DRY-RUN"} sessions=${rows.length}` +
      (examId ? ` exam=${examId}` : "") +
      (sessionId ? ` session=${sessionId}` : ""),
  );
  if (!apply) {
    console.log(
      "[recalc] Tidak ada data yang ditulis. Tambahkan --apply untuk menyimpan.",
    );
  }

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let oldTotal = 0;
  let newTotal = 0;
  let printed = 0;

  for (const row of rows) {
    const result = await recalculateSessionScores(row.id, { apply });

    if (!result) {
      skipped += 1;
      console.log(`[skip] session=${row.id} tidak ditemukan`);
      continue;
    }
    if (result.skipped) {
      skipped += 1;
      continue;
    }

    oldTotal += result.oldScore;
    newTotal += result.newScore;

    if (!result.changed) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    if (printed < 100) {
      printed += 1;
      console.log(
        `[change] session=${row.id} exam=${row.examId} siswa=${row.username} ` +
          `${result.oldScore.toFixed(2)} -> ${result.newScore.toFixed(2)} ` +
          `(${result.oldGradingStatus} -> ${result.newGradingStatus}, ` +
          `jawaban berubah=${result.changedAnswers})`,
      );
    }
  }

  if (changed > printed) {
    console.log(`[recalc] ${changed - printed} perubahan lain tidak dicetak.`);
  }

  console.log(
    `[recalc] selesai: sesi=${rows.length} berubah=${changed} ` +
      `tetap=${unchanged} dilewati=${skipped} ` +
      `total ${round2(oldTotal).toFixed(2)} -> ${round2(newTotal).toFixed(2)}`,
  );
}

try {
  await main();
} catch (error) {
  console.error("[recalc] gagal:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
