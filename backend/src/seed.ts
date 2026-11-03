import { randomUUID } from "node:crypto";
import { db, pool } from "./db";
import { migrate } from "./db/migrate";
import {
  examParticipants,
  examQuestions,
  exams,
  subjects,
  users,
} from "./db/schema";
import { env } from "./env";
import { parseQuestions } from "./lib/parsers";
import { insertParsedQuestion } from "./lib/questions";

const AIKEN_SAMPLE = `Ibu kota Indonesia adalah?
A. Bandung
B. Jakarta
C. Surabaya
D. Medan
ANSWER: B

Hasil dari 7 x 8 adalah?
A. 54
B. 56
C. 58
D. 64
ANSWER: B
`;

const GIFT_SAMPLE = `$CATEGORY: Matematika/Aljabar

::Persamaan linear::
Nilai x dari 2x + 4 = 10 adalah ... {=3 ~2 ~4 ~5}

::Benar atau salah::
Bumi berbentuk bulat. {TRUE}

::Matching planet::
Pasangkan planet dengan urutannya dari Matahari. {=Merkurius -> 1 =Venus -> 2 =Bumi -> 3}

::Ibu kota Jepang::
Ibu kota Jepang adalah ... {=Tokyo}

::Akar kuadrat::
Akar kuadrat dari 144 adalah ... {#12:0.01}

::Essay::
Jelaskan proses fotosintesis secara singkat. {}
`;

export async function seedDemoData(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    console.log("[seed] data sudah ada, seed dilewati.");
    return;
  }

  const adminId = randomUUID();
  const studentId = randomUUID();

  await db.insert(users).values([
    {
      id: adminId,
      username: env.seedAdminUsername,
      passwordHash: await Bun.password.hash(env.seedAdminPassword),
      fullName: "Administrator",
      role: "admin",
    },
    {
      id: studentId,
      username: env.seedStudentUsername,
      passwordHash: await Bun.password.hash(env.seedStudentPassword),
      fullName: "Siswa Demo",
      role: "student",
    },
  ]);

  const subjectId = randomUUID();
  await db.insert(subjects).values({
    id: subjectId,
    code: "MTK",
    name: "Matematika",
  });

  const aiken = parseQuestions("aiken", AIKEN_SAMPLE);
  const gift = parseQuestions("gift", GIFT_SAMPLE);

  const questionIds: string[] = [];
  for (const question of aiken.questions) {
    questionIds.push(await insertParsedQuestion(subjectId, question, "aiken"));
  }
  for (const question of gift.questions) {
    questionIds.push(await insertParsedQuestion(subjectId, question, "gift"));
  }

  const examId = randomUUID();
  await db.insert(exams).values({
    id: examId,
    subjectId,
    title: "Ujian Demo Matematika",
    description:
      "Ujian contoh berisi soal AIKEN dan GIFT (PG, benar/salah, matching, isian, numerik, essay).",
    durationMinutes: 30,
    maxStrikes: 3,
    status: "published",
    createdBy: adminId,
  });

  await db.insert(examQuestions).values(
    questionIds.map((questionId, index) => ({
      id: randomUUID(),
      examId,
      questionId,
      orderIndex: index,
    })),
  );

  await db.insert(examParticipants).values({
    id: randomUUID(),
    examId,
    userId: studentId,
    assignedBy: adminId,
  });

  console.log(
    `[seed] selesai: ${questionIds.length} soal. admin=${env.seedAdminUsername}, siswa=${env.seedStudentUsername}`,
  );
  console.log(
    `[seed] parse error: aiken=${aiken.errors.length}, gift=${gift.errors.length}`,
  );
  if (gift.errors.length > 0) console.log(gift.errors);
}

if (import.meta.main) {
  await migrate();
  await seedDemoData();
  await pool.end();
}
