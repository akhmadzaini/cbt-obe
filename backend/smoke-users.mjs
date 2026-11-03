import ExcelJS from "exceljs";

const BASE = "http://localhost:8080/api";
let failed = 0;

function check(name, condition, extra = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name} ${extra}`);
  }
}

async function req(path, { method = "GET", token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? body,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, res };
}

async function login(username, password) {
  const login = await req("/auth/login", {
    method: "POST",
    json: { username, password },
  });
  check(`login ${username}`, login.status === 200 && Boolean(login.data.token));
  return { token: login.data.token, user: login.data.user ?? null };
}

function bufferToForm(buffer, filename) {
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  return form;
}

async function buildWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Peserta");
  ws.addRows(rows);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

const admin = await login("admin", "admin12345");
const adminToken = admin.token;

// 1. Akses non-admin ditolak
const siswaProbe = await login("siswa", "siswa12345");
const forbiddenList = await req("/users?role=student", { token: siswaProbe.token });
check("siswa ditolak pada list user", forbiddenList.status === 403, `status=${forbiddenList.status}`);
const forbiddenTemplate = await req("/users/template", { token: siswaProbe.token });
check("siswa ditolak pada template", forbiddenTemplate.status === 403, `status=${forbiddenTemplate.status}`);
const forbiddenResults = await req("/results", { token: siswaProbe.token });
check("siswa ditolak pada results", forbiddenResults.status === 403, `status=${forbiddenResults.status}`);

// 2. Template
const template = await req("/users/template", { token: adminToken });
check("template 200", template.status === 200, `status=${template.status}`);
check(
  "template content-type xlsx",
  (template.res.headers.get("content-type") ?? "").includes("spreadsheetml"),
  template.res.headers.get("content-type") ?? "none",
);
const templateBuf = Buffer.from(await template.res.arrayBuffer());
check("template berisi byte", templateBuf.length > 500, `bytes=${templateBuf.length}`);
const templateWb = new ExcelJS.Workbook();
await templateWb.xlsx.load(templateBuf);
const headerTexts = templateWb.getWorksheet("Peserta")
  .getRow(1)
  .cells.map((cell) => cell.text)
  .filter(Boolean);
check(
  "header template",
  headerTexts.join("|").includes("Username") &&
    headerTexts.join("|").includes("Nama Lengkap") &&
    headerTexts.join("|").includes("Password") &&
    headerTexts.join("|").includes("Aktif"),
  headerTexts.join("|"),
);
check("sheet Petunjuk ada", templateWb.getWorksheet("Petunjuk") !== undefined);

// 3. Import campuran (valid + error)
const mixedBuf = await buildWorkbook([
  ["Username", "Nama Lengkap", "Password", "Aktif (Ya/Tidak)"],
  ["uji001", "Uji Satu", "rahasia123", "Ya"],
  ["uji002", "Uji Dua", "rahasia123", "Ya"],
  ["uji001", "Uji Duplikat", "rahasia123", "Ya"],
  ["", "Tanpa Username", "rahasia123", "Ya"],
  ["uji003", "Pendek", "123", "Ya"],
  ["uji004", "Uji Empat", "rahasia123", "Mungkin"],
]);
const mixedImport = await req("/users/import", {
  token: adminToken,
  method: "POST",
  form: bufferToForm(mixedBuf, "peserta.xlsx"),
});
check("import mixed 200", mixedImport.status === 200, JSON.stringify(mixedImport.data));
check("import mixed imported=2", mixedImport.data.imported === 2, JSON.stringify(mixedImport.data));
check(
  "import mixed failed=4, ada duplikat file",
  mixedImport.data.failed === 4 &&
    mixedImport.data.errors.some((e) => e.message.includes("duplikat")),
  JSON.stringify(mixedImport.data.errors),
);

// 4. Re-import skip lalu update
const skipImport = await req("/users/import", {
  token: adminToken,
  method: "POST",
  form: bufferToForm(mixedBuf, "peserta.xlsx"),
});
check("re-import skip imported=0 skipped=2", skipImport.data.imported === 0 && skipImport.data.skipped === 2, JSON.stringify(skipImport.data));

const formUpdate = bufferToForm(mixedBuf, "peserta.xlsx");
formUpdate.append("mode", "update");
const updateImport = await req("/users/import", {
  token: adminToken,
  method: "POST",
  form: formUpdate,
});
check("re-import update updated=2", updateImport.status === 200 && updateImport.data.updated === 2, JSON.stringify(updateImport.data));

// 5. Proteksi non-peserta
const protectedBuf = await buildWorkbook([
  ["Username", "Nama Lengkap", "Password", "Aktif (Ya/Tidak)"],
  ["admin", "Admin Baru", "rahasia123", "Ya"],
  ["siswa", "Siswa Satu", "rahasia123", "Ya"],
]);
const protectedImport = await req("/users/import", {
  token: adminToken,
  method: "POST",
  form: bufferToForm(protectedBuf, "peserta.xlsx"),
});
check(
  "admin non-peserta ditolak & siswa di-skip",
  protectedImport.data.failed === 1 &&
    protectedImport.data.skipped === 1 &&
    protectedImport.data.imported === 0,
  JSON.stringify(protectedImport.data),
);

// 6. List user
const list = await req("/users?role=student&search=uji", { token: adminToken });
const uji = list.data.users ?? [];
check("list menemukan uji001/uji002", uji.length >= 2 && uji.some((u) => u.username === "uji001"), JSON.stringify(uji));

// 7. Peserta hasil import bisa login dan mengerjakan ujian
const uji001 = await login("uji001", "rahasia123");
check("nama uji001 benar", uji001.user?.fullName === "Uji Satu", JSON.stringify(uji001.user));

const examList = await req("/exams", { token: uji001.token });
const publishedExam = (examList.data.exams ?? []).find((exam) => exam.status === "published");
check("ada ujian published", Boolean(publishedExam), JSON.stringify(examList.data).slice(0, 200));
if (!publishedExam) process.exit(1);

const start = await req("/sessions/start", {
  token: uji001.token,
  method: "POST",
  json: { examId: publishedExam.id },
});
check("sesi mulai", start.status === 200 && Boolean(start.data.session?.id), JSON.stringify(start.data).slice(0, 200));
const sessionId = start.data.session.id;
const questions = start.data.questions ?? [];

let answered = 0;
for (const question of questions) {
  if (["multiple_choice", "true_false"].includes(question.questionType) && question.options[0]) {
    const save = await req(`/sessions/${sessionId}/answers/${question.id}`, {
      token: uji001.token,
      method: "PUT",
      json: { selectedOptionId: question.options[0].id },
    });
    if (save.status !== 200) {
      console.log(`  jawab gagal ${question.id}:`, JSON.stringify(save.data));
      break;
    }
    answered += 1;
  }
}
check("jawaban tersimpan >=1", answered >= 1, `answered=${answered}`);

// 8. Pelanggaran: 1 strike + 1 non-strike
const strike = await req(`/sessions/${sessionId}/violations`, {
  token: uji001.token,
  method: "POST",
  json: { violationType: "window_blur" },
});
check("strike tercatat", strike.status === 200 && strike.data.strikeCount === 1, JSON.stringify(strike.data));
const softViolation = await req(`/sessions/${sessionId}/violations`, {
  token: uji001.token,
  method: "POST",
  json: { violationType: "copy_paste" },
});
check("pelanggaran non-strike tercatat", softViolation.status === 200, JSON.stringify(softViolation.data));
await req(`/sessions/${sessionId}/resume`, { token: uji001.token, method: "POST" });

const submit = await req(`/sessions/${sessionId}/submit`, {
  token: uji001.token,
  method: "POST",
});
check("submit sukses", submit.status === 200, JSON.stringify(submit.data).slice(0, 200));

// 9. Rekap results admin
const results = await req(`/results?examId=${publishedExam.id}`, { token: adminToken });
const row = (results.data.results ?? []).find((r) => r.username === "uji001");
check(
  "results memuat uji001",
  Boolean(row),
  JSON.stringify(results.data).slice(0, 300),
);
check(
  "result row: score+maxScore",
  row && row.score !== null && row.maxScore > 0,
  JSON.stringify(row),
);
check(
  "result row: violationCount=2, strikeCount=1",
  row && row.violationCount === 2 && row.strikeCount === 1,
  JSON.stringify(row),
);
check(
  "result row: finishedReason terisi",
  row && row.finishedReason !== null,
  JSON.stringify(row?.finishedReason),
);

// 10. Detail sesi
const detail = await req(`/results/${sessionId}`, { token: adminToken });
check("detail 200", detail.status === 200, JSON.stringify(detail.data).slice(0, 120));
check(
  "detail: 2 pelanggaran",
  (detail.data.violations ?? []).length === 2,
  JSON.stringify(detail.data.violations),
);
check(
  "detail: jumlah soal & sesi sesuai",
  detail.data.session?.examId === publishedExam.id &&
    (detail.data.questions ?? []).length === questions.length,
  JSON.stringify(detail.data.session),
);
const essay = (detail.data.questions ?? []).find((q) => q.questionType === "essay");
check(
  "detail: soal essay belum dinilai (scoreAwarded null di answers)",
  (detail.data.answers ?? []).some((a) => a.scoreAwarded === null) ||
    !essay,
  JSON.stringify(detail.data.answers?.[0]),
);

console.log(failed === 0 ? "\nSEMUA TES LULUS" : `\n${failed} TES GAGAL`);
process.exit(failed === 0 ? 0 : 1);
