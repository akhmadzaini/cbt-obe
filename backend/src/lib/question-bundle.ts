import { inArray } from "drizzle-orm";
import { db } from "../db";
import {
  questionMatchPairs,
  questionOptions,
  questions,
} from "../db/schema";

type QueryExecutor = Pick<typeof db, "select">;

export type QuestionBundle = {
  question: typeof questions.$inferSelect;
  options: (typeof questionOptions.$inferSelect)[];
  matchPairs: (typeof questionMatchPairs.$inferSelect)[];
};

/**
 * Memuat soal beserta opsi dan pasangan mencocokkan dalam satu kali query per
 * tabel. Hasil dipetakan berdasarkan id soal agar pemanggil tidak perlu
 * memfilter berulang kali.
 */
export async function loadQuestionBundles(
  questionIds: string[],
  executor: QueryExecutor = db,
): Promise<Map<string, QuestionBundle>> {
  const uniqueIds = [...new Set(questionIds)];
  const bundles = new Map<string, QuestionBundle>();
  if (uniqueIds.length === 0) return bundles;

  const [questionRows, optionRows, pairRows] = await Promise.all([
    executor
      .select()
      .from(questions)
      .where(inArray(questions.id, uniqueIds)),
    executor
      .select()
      .from(questionOptions)
      .where(inArray(questionOptions.questionId, uniqueIds))
      .orderBy(questionOptions.orderIndex),
    executor
      .select()
      .from(questionMatchPairs)
      .where(inArray(questionMatchPairs.questionId, uniqueIds))
      .orderBy(questionMatchPairs.orderIndex),
  ]);

  for (const question of questionRows) {
    bundles.set(question.id, { question, options: [], matchPairs: [] });
  }
  for (const option of optionRows) {
    bundles.get(option.questionId)?.options.push(option);
  }
  for (const pair of pairRows) {
    bundles.get(pair.questionId)?.matchPairs.push(pair);
  }

  return bundles;
}
