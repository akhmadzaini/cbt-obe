import ExcelJS from "exceljs";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  examAnswers,
  examQuestions,
  examSessions,
  exams,
  questions,
  users,
} from "../db/schema";

export type ResultsExportMode = "summary" | "category";

type ResultsExport = {
  buffer: Buffer;
  filename: string;
};

const UNCATEGORIZED_KEY = "__uncategorized__";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "ujian";
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function categoryKey(category: string | null): string {
  return category?.trim() || UNCATEGORIZED_KEY;
}

function categoryLabel(key: string): string {
  return key === UNCATEGORIZED_KEY ? "Tanpa kategori" : key;
}

function styleSheet(sheet: ExcelJS.Worksheet, columnCount: number): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2F56D4" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 24;

  const lastColumn = String.fromCharCode("A".charCodeAt(0) + columnCount - 1);
  sheet.autoFilter = { from: "A1", to: `${lastColumn}1` };
}

/**
 * Membuat workbook nilai untuk satu ujian. Hanya sesi berstatus `finished`
 * yang diekspor. Skor memakai hasil finalisasi (atau nilai essay manual yang
 * sudah tersimpan), sedangkan total skor dihitung dari bobot soal.
 */
export async function buildResultsExport(
  examId: string,
  mode: ResultsExportMode,
): Promise<ResultsExport | null> {
  const [exam] = await db
    .select({ id: exams.id, title: exams.title })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);

  if (!exam) return null;

  const sessionRows = await db
    .select({
      sessionId: examSessions.id,
      username: users.username,
      fullName: users.fullName,
      score: examSessions.score,
    })
    .from(examSessions)
    .innerJoin(users, eq(users.id, examSessions.userId))
    .where(
      and(
        eq(examSessions.examId, examId),
        eq(examSessions.status, "finished"),
      ),
    )
    .orderBy(asc(users.username), asc(users.fullName));

  const questionRows = await db
    .select({
      questionId: examQuestions.questionId,
      pointsOverride: examQuestions.pointsOverride,
      points: questions.points,
      category: questions.category,
    })
    .from(examQuestions)
    .innerJoin(questions, eq(questions.id, examQuestions.questionId))
    .where(eq(examQuestions.examId, examId));

  const totalScore = round2(
    questionRows.reduce(
      (sum, row) => sum + Number(row.pointsOverride ?? row.points),
      0,
    ),
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CBT";
  workbook.created = new Date();

  if (mode === "summary") {
    const sheet = workbook.addWorksheet("Nilai");
    sheet.columns = [
      { header: "NIM", key: "nim", width: 24 },
      { header: "Nama", key: "nama", width: 34 },
      { header: "Skor", key: "skor", width: 14 },
      { header: "Total Skor", key: "totalSkor", width: 14 },
    ];
    styleSheet(sheet, 4);

    sheet.getColumn("nim").numFmt = "@";

    for (const row of sessionRows) {
      sheet.addRow({
        nim: row.username,
        nama: row.fullName,
        skor: round2(Number(row.score ?? 0)),
        totalSkor: totalScore,
      });
    }

    sheet.getColumn("skor").numFmt = "0.00";
    sheet.getColumn("totalSkor").numFmt = "0.00";

    return {
      buffer: Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
      filename: `nilai-${slugify(exam.title)}-ringkasan-${todayStamp()}.xlsx`,
    };
  }

  const questionCategory = new Map<string, string>();
  const categoryTotals = new Map<string, number>();

  for (const row of questionRows) {
    const key = categoryKey(row.category);
    questionCategory.set(row.questionId, key);
    categoryTotals.set(
      key,
      (categoryTotals.get(key) ?? 0) +
        Number(row.pointsOverride ?? row.points),
    );
  }

  const orderedCategories = [...categoryTotals.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED_KEY) return 1;
    if (b === UNCATEGORIZED_KEY) return -1;
    return a.localeCompare(b, "id");
  });

  const scoreBySession = new Map<string, Map<string, number>>();
  for (const row of sessionRows) {
    scoreBySession.set(row.sessionId, new Map());
  }

  const answerRows = await db
    .select({
      sessionId: examAnswers.sessionId,
      questionId: examAnswers.questionId,
      scoreAwarded: examAnswers.scoreAwarded,
    })
    .from(examAnswers)
    .innerJoin(examSessions, eq(examSessions.id, examAnswers.sessionId))
    .where(
      and(
        eq(examSessions.examId, examId),
        eq(examSessions.status, "finished"),
      ),
    );

  for (const answer of answerRows) {
    const key = questionCategory.get(answer.questionId);
    if (!key) continue;

    const scoreMap = scoreBySession.get(answer.sessionId);
    if (!scoreMap) continue;

    scoreMap.set(
      key,
      (scoreMap.get(key) ?? 0) + Number(answer.scoreAwarded ?? 0),
    );
  }

  const sheet = workbook.addWorksheet("Nilai per Kategori");
  sheet.columns = [
    { header: "NIM", key: "nim", width: 24 },
    { header: "Nama", key: "nama", width: 34 },
    { header: "Kategori Soal", key: "kategori", width: 30 },
    { header: "Skor", key: "skor", width: 14 },
    { header: "Total Skor", key: "totalSkor", width: 14 },
  ];
  styleSheet(sheet, 5);

  sheet.getColumn("nim").numFmt = "@";

  for (const row of sessionRows) {
    const scoreMap = scoreBySession.get(row.sessionId) ?? new Map<string, number>();

    for (const key of orderedCategories) {
      sheet.addRow({
        nim: row.username,
        nama: row.fullName,
        kategori: categoryLabel(key),
        skor: round2(scoreMap.get(key) ?? 0),
        totalSkor: round2(categoryTotals.get(key) ?? 0),
      });
    }
  }

  sheet.getColumn("skor").numFmt = "0.00";
  sheet.getColumn("totalSkor").numFmt = "0.00";

  return {
    buffer: Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
    filename: `nilai-${slugify(exam.title)}-per-kategori-${todayStamp()}.xlsx`,
  };
}
