import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, apiDownload, apiForm, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import AdminNav from "../components/AdminNav";
import ExamCreateDialog from "../components/ExamCreateDialog";
import ExamCancelDialog from "../components/ExamCancelDialog";
import ExamParticipantsModal from "../components/ExamParticipantsModal";
import QuestionDeleteDialog from "../components/QuestionDeleteDialog";
import QuestionEditorModal from "../components/QuestionEditorModal";
import ParticipantDeleteDialog from "../components/ParticipantDeleteDialog";
import ParticipantEditorModal from "../components/ParticipantEditorModal";
import SessionCancelDialog from "../components/SessionCancelDialog";
import SessionResetDialog from "../components/SessionResetDialog";
import SystemPanel from "../components/SystemPanel";
import Toast from "../components/Toast";
import type {
  AdminQuestion,
  AdminTab,
  ExamParticipantsResponse,
  ExamResultDetail,
  ExamResultRow,
  ExamSummary,
  ExamUsage,
  ImportResult,
  Participant,
  ParticipantInput,
  ParticipantUsage,
  PendingGradingSession,
  QuestionInput,
  QuestionUsage,
  SessionCancelUsage,
  Subject,
  UserImportResult,
} from "../lib/types";
import QuestionBankTab from "./admin/QuestionBankTab";
import ExamTab from "./admin/ExamTab";
import GradingTab from "./admin/GradingTab";
import ParticipantsTab from "./admin/ParticipantsTab";
import TeacherTab from "./admin/TeacherTab";
import ResultsTab from "./admin/ResultsTab";
import ResultDetailModal from "./admin/ResultDetailModal";
import type {
  ExamCancelState,
  ExamCreateConfirmState,
  ExamFormState,
  ExamParticipantsState,
  ImportRow,
  ParticipantDeleteState,
  ParticipantEditorState,
  QuestionDeleteState,
  QuestionEditorState,
  SessionCancelState,
  SessionResetState,
  ToastState,
} from "./admin/types";

export default function AdminPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>("bank");

  useEffect(() => {
    if (
      (tab === "system" || tab === "teachers") &&
      user?.role !== "admin"
    ) {
      setTab("bank");
    }
  }, [tab, user?.role]);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [subjectId, setSubjectId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingQuestionId, setUploadingQuestionId] = useState<string | null>(
    null,
  );
  const [questionEditor, setQuestionEditor] =
    useState<QuestionEditorState | null>(null);
  const [questionDelete, setQuestionDelete] =
    useState<QuestionDeleteState | null>(null);
  const [participantEditor, setParticipantEditor] =
    useState<ParticipantEditorState | null>(null);
  const [participantDelete, setParticipantDelete] =
    useState<ParticipantDeleteState | null>(null);
  const [examParticipantsState, setExamParticipantsState] =
    useState<ExamParticipantsState | null>(null);
  const [examCancelState, setExamCancelState] =
    useState<ExamCancelState | null>(null);
  const [sessionResetState, setSessionResetState] =
    useState<SessionResetState | null>(null);
  const [sessionCancelState, setSessionCancelState] =
    useState<SessionCancelState | null>(null);
  const [examCreateConfirm, setExamCreateConfirm] =
    useState<ExamCreateConfirmState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    string[]
  >([]);
  const [pendingGrading, setPendingGrading] = useState<PendingGradingSession[]>(
    [],
  );
  const [gradingDrafts, setGradingDrafts] = useState<Record<string, string>>(
    {},
  );
  const [gradingBusyId, setGradingBusyId] = useState<string | null>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantImporting, setParticipantImporting] = useState(false);
  const [participantImportMode, setParticipantImportMode] = useState<"skip" | "update">("skip");
  const [participantImportResult, setParticipantImportResult] =
    useState<UserImportResult | null>(null);

  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [resultsExamId, setResultsExamId] = useState("");
  const [resultsStatus, setResultsStatus] = useState("all");
  const [resultsSearch, setResultsSearch] = useState("");
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultDetail, setResultDetail] = useState<ExamResultDetail | null>(null);
  const [resultDetailLoading, setResultDetailLoading] = useState(false);
  const [exportMode, setExportMode] = useState<"summary" | "category">(
    "summary",
  );
  const [exporting, setExporting] = useState(false);

  const [newSubject, setNewSubject] = useState({ code: "", name: "" });

  const [examForm, setExamForm] = useState<ExamFormState>({
    title: "",
    description: "",
    durationMinutes: 30,
    maxStrikes: 3,
    shuffleQuestions: false,
    shuffleOptions: false,
    publish: true,
  });
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  const loadExams = useCallback(async () => {
    const response = await api<{ exams: ExamSummary[] }>("/exams");
    setExams(response.exams);
  }, []);

  const loadImports = useCallback(async () => {
    const response = await api<{ imports: ImportRow[] }>("/imports");
    setImports(response.imports);
  }, []);

  const loadQuestions = useCallback(async (id: string) => {
    if (!id) {
      setQuestions([]);
      return;
    }
    const response = await api<{ questions: AdminQuestion[] }>(
      `/questions?subjectId=${encodeURIComponent(id)}`,
    );
    setQuestions(response.questions);
  }, []);

  const loadPendingGrading = useCallback(async () => {
    const response = await api<{ sessions: PendingGradingSession[] }>(
      "/grading/pending",
    );
    setPendingGrading(response.sessions);
    const drafts: Record<string, string> = {};
    for (const session of response.sessions) {
      for (const essay of session.essays) {
        if (essay.answerId) {
          drafts[essay.answerId] = essay.scoreAwarded ?? "";
        }
      }
    }
    setGradingDrafts(drafts);
  }, []);

  const loadParticipants = useCallback(async () => {
    const response = await api<{ users: Participant[] }>("/users?role=student");
    setParticipants(response.users);
  }, []);

  const loadResults = useCallback(async () => {
    if (!resultsExamId) {
      setResults([]);
      return;
    }
    const params = new URLSearchParams({
      examId: resultsExamId,
      status: resultsStatus,
    });
    if (resultsSearch.trim()) params.set("search", resultsSearch.trim());
    const response = await api<{ results: ExamResultRow[] }>(
      `/results?${params.toString()}`,
    );
    setResults(response.results);
  }, [resultsExamId, resultsSearch, resultsStatus]);

  useEffect(() => {
    Promise.all([
      api<{ subjects: Subject[] }>("/subjects"),
      api<{ exams: ExamSummary[] }>("/exams"),
      api<{ imports: ImportRow[] }>("/imports"),
    ])
      .then(([subjectResponse, examResponse, importResponse]) => {
        setSubjects(subjectResponse.subjects);
        setExams(examResponse.exams);
        setImports(importResponse.imports);
        if (subjectResponse.subjects[0]) {
          setSubjectId(subjectResponse.subjects[0].id);
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Gagal memuat data."),
      );
  }, []);

  useEffect(() => {
    void loadQuestions(subjectId).catch((err) =>
      setError(err instanceof Error ? err.message : "Gagal memuat soal."),
    );
  }, [subjectId, loadQuestions]);

  useEffect(() => {
    if (tab !== "grading") return;
    void loadPendingGrading().catch((err) =>
      setError(err instanceof Error ? err.message : "Gagal memuat penilaian."),
    );
  }, [tab, loadPendingGrading]);

  useEffect(() => {
    if (tab !== "participants" && tab !== "exam") return;
    void loadParticipants().catch((err) =>
      setError(err instanceof Error ? err.message : "Gagal memuat peserta."),
    );
  }, [tab, loadParticipants]);

  useEffect(() => {
    if (tab !== "results") return;
    if (!resultsExamId && exams[0]) {
      setResultsExamId(exams[0].id);
      return;
    }
    const timer = setTimeout(() => {
      setResultsLoading(true);
      void loadResults()
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Gagal memuat skor peserta.",
          ),
        )
        .finally(() => setResultsLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [tab, resultsExamId, resultsStatus, resultsSearch, exams, loadResults]);

  async function handleCreateSubject(event: FormEvent) {
    event.preventDefault();
    if (!newSubject.code.trim() || !newSubject.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ subject: Subject }>("/subjects", {
        method: "POST",
        body: JSON.stringify({
          code: newSubject.code.trim(),
          name: newSubject.name.trim(),
        }),
      });
      setSubjects((previous) => [...previous, response.subject]);
      setSubjectId(response.subject.id);
      setNewSubject({ code: "", name: "" });
      setNotice("Mapel dibuat.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat mapel.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiForm<ImportResult>("/imports", form);
      setNotice(
        `Import ${result.format.toUpperCase()} selesai: ${result.imported}/${result.total} soal tersimpan.`,
      );
      if (result.errors.length > 0) {
        setError(
          `${result.errors.length} soal gagal diparse. Contoh: ${result.errors[0].message}`,
        );
      }
      event.currentTarget.reset();
      await Promise.all([loadQuestions(subjectId), loadImports()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadImage(questionId: string, file: File | null) {
    if (!file) return;
    setUploadingQuestionId(questionId);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      await apiForm<{ questionId: string; imageUrl: string }>(
        `/questions/${questionId}/image`,
        form,
      );
      await loadQuestions(subjectId);
      setNotice("Gambar soal berhasil diunggah.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengunggah gambar soal.",
      );
    } finally {
      setUploadingQuestionId(null);
    }
  }

  function openCreateQuestion() {
    if (!subjectId) {
      setError("Pilih mapel terlebih dahulu.");
      return;
    }
    setError(null);
    setNotice(null);
    setQuestionEditor({
      mode: "create",
      question: null,
      usage: null,
      loadingUsage: false,
      saving: false,
      error: null,
    });
  }

  async function openEditQuestion(question: AdminQuestion) {
    setError(null);
    setNotice(null);
    setQuestionEditor({
      mode: "edit",
      question,
      usage: null,
      loadingUsage: true,
      saving: false,
      error: null,
    });

    try {
      const usage = await api<QuestionUsage>(
        `/questions/${question.id}/usage`,
      );
      setQuestionEditor((previous) =>
        previous &&
        previous.mode === "edit" &&
        previous.question?.id === question.id
          ? { ...previous, usage, loadingUsage: false }
          : previous,
      );
    } catch (err) {
      setQuestionEditor((previous) =>
        previous &&
        previous.mode === "edit" &&
        previous.question?.id === question.id
          ? {
              ...previous,
              loadingUsage: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal memeriksa pemakaian soal.",
            }
          : previous,
      );
    }
  }

  async function openDeleteQuestion(question: AdminQuestion) {
    setError(null);
    setNotice(null);
    setQuestionDelete({
      question,
      usage: null,
      loadingUsage: true,
      deleting: false,
      error: null,
    });

    try {
      const usage = await api<QuestionUsage>(
        `/questions/${question.id}/usage`,
      );
      setQuestionDelete((previous) =>
        previous && previous.question.id === question.id
          ? { ...previous, usage, loadingUsage: false }
          : previous,
      );
    } catch (err) {
      setQuestionDelete((previous) =>
        previous && previous.question.id === question.id
          ? {
              ...previous,
              loadingUsage: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal memeriksa pemakaian soal.",
            }
          : previous,
      );
    }
  }

  function usageFromError(err: unknown): QuestionUsage | null {
    if (
      err instanceof ApiError &&
      err.detail &&
      typeof err.detail === "object" &&
      "usage" in err.detail
    ) {
      return (err.detail as { usage?: QuestionUsage }).usage ?? null;
    }
    return null;
  }

  async function handleSaveQuestion(input: QuestionInput) {
    const current = questionEditor;
    if (!current) return;

    setQuestionEditor((previous) =>
      previous ? { ...previous, saving: true, error: null } : previous,
    );
    setError(null);

    try {
      let successMessage: string;

      if (current.mode === "create") {
        await api("/questions", {
          method: "POST",
          body: JSON.stringify({ subjectId, ...input }),
        });
        successMessage = "Soal manual berhasil dibuat.";
      } else if (current.question) {
        await api(`/questions/${current.question.id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
        successMessage = "Soal berhasil diperbarui.";
      } else {
        throw new Error("Soal tidak ditemukan.");
      }

      setQuestionEditor(null);
      setNotice(successMessage);

      try {
        await loadQuestions(subjectId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar soal.",
        );
      }
    } catch (err) {
      const usage = usageFromError(err);
      setQuestionEditor((previous) =>
        previous
          ? {
              ...previous,
              saving: false,
              error:
                err instanceof Error ? err.message : "Gagal menyimpan soal.",
              usage: usage ?? previous.usage,
            }
          : previous,
      );
    }
  }

  async function handleDeleteQuestion() {
    const current = questionDelete;
    if (!current) return;

    setQuestionDelete((previous) =>
      previous ? { ...previous, deleting: true, error: null } : previous,
    );
    setError(null);

    try {
      await api(`/questions/${current.question.id}`, { method: "DELETE" });

      setQuestionDelete(null);
      setNotice("Soal berhasil dihapus.");

      try {
        await loadQuestions(subjectId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar soal.",
        );
      }
    } catch (err) {
      const usage = usageFromError(err);
      setQuestionDelete((previous) =>
        previous
          ? {
              ...previous,
              deleting: false,
              error:
                err instanceof Error ? err.message : "Gagal menghapus soal.",
              usage: usage ?? previous.usage,
            }
          : previous,
      );
    }
  }

  function handleCreateExam(event: FormEvent) {
    event.preventDefault();
    if (!subjectId) {
      setError("Pilih mapel terlebih dahulu.");
      return;
    }
    if (!examForm.title.trim()) {
      setError("Judul ujian wajib diisi.");
      return;
    }
    const durationMinutes = Number(examForm.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      setError("Durasi ujian minimal 1 menit.");
      return;
    }
    const maxStrikes = Number(examForm.maxStrikes);
    if (!Number.isFinite(maxStrikes) || maxStrikes < 1) {
      setError("Maksimal pelanggaran minimal 1.");
      return;
    }
    if (selectedQuestionIds.length === 0) {
      setError("Pilih minimal satu soal untuk ujian.");
      return;
    }

    setError(null);
    setNotice(null);
    setExamCreateConfirm({ saving: false, error: null });
  }

  async function handleConfirmCreateExam() {
    if (!examCreateConfirm || examCreateConfirm.saving) return;

    const title = examForm.title.trim();
    const publish = examForm.publish;
    const participantCount = selectedParticipantIds.length;

    setExamCreateConfirm({ saving: true, error: null });
    setError(null);

    let created: { exam: { id: string } };
    try {
      created = await api<{ exam: { id: string } }>("/exams", {
        method: "POST",
        body: JSON.stringify({
          subjectId,
          title,
          description: examForm.description.trim() || undefined,
          durationMinutes: Number(examForm.durationMinutes),
          maxStrikes: Number(examForm.maxStrikes),
          shuffleQuestions: examForm.shuffleQuestions,
          shuffleOptions: examForm.shuffleOptions,
          questionIds: selectedQuestionIds,
          participantIds: selectedParticipantIds,
        }),
      });
    } catch (err) {
      setExamCreateConfirm({
        saving: false,
        error: err instanceof Error ? err.message : "Gagal membuat ujian.",
      });
      return;
    }

    let publishError: string | null = null;
    if (publish) {
      try {
        await api(`/exams/${created.exam.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "published" }),
        });
      } catch (err) {
        publishError =
          err instanceof Error
            ? err.message
            : "Gagal mempublikasikan ujian.";
      }
    }

    setExamCreateConfirm(null);
    setToast({
      id: Date.now(),
      title: "Ujian berhasil dibuat",
      message: `"${title}" ${
        publish && !publishError
          ? "sudah dipublikasikan"
          : "disimpan sebagai draft"
      }${
        participantCount > 0
          ? ` untuk ${participantCount} peserta`
          : " tanpa peserta"
      }.`,
    });

    setExamForm((previous) => ({
      ...previous,
      title: "",
      description: "",
    }));
    setSelectedQuestionIds([]);
    setSelectedParticipantIds([]);
    setTab("exam");

    let loadError: string | null = null;
    try {
      await loadExams();
    } catch (err) {
      loadError =
        err instanceof Error
          ? err.message
          : "Gagal memuat ulang daftar ujian.";
    }

    if (publishError || loadError) {
      setError(
        [
          publishError
            ? `Ujian dibuat sebagai draft, tetapi publikasi gagal: ${publishError}. Publikasikan manual dari daftar ujian.`
            : null,
          loadError ? `Daftar ujian gagal dimuat ulang: ${loadError}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  }

  async function openExamParticipants(exam: ExamSummary) {
    setError(null);
    setNotice(null);
    setExamParticipantsState({
      exam,
      participants: null,
      loading: true,
      saving: false,
      error: null,
    });

    try {
      const response = await api<ExamParticipantsResponse>(
        `/exams/${exam.id}/participants`,
      );
      setExamParticipantsState((previous) =>
        previous && previous.exam.id === exam.id
          ? { ...previous, participants: response.participants, loading: false }
          : previous,
      );
    } catch (err) {
      setExamParticipantsState((previous) =>
        previous && previous.exam.id === exam.id
          ? {
              ...previous,
              loading: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal memuat peserta ujian.",
            }
          : previous,
      );
    }
  }

  async function handleSaveExamParticipants(participantIds: string[]) {
    const current = examParticipantsState;
    if (!current) return;

    setExamParticipantsState((previous) =>
      previous ? { ...previous, saving: true, error: null } : previous,
    );

    try {
      await api(`/exams/${current.exam.id}/participants`, {
        method: "PUT",
        body: JSON.stringify({ participantIds }),
      });

      setExamParticipantsState(null);
      setNotice("Peserta ujian berhasil diperbarui.");

      try {
        await loadExams();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar ujian.",
        );
      }
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Gagal menyimpan peserta ujian.";

      if (
        err instanceof ApiError &&
        err.detail &&
        typeof err.detail === "object" &&
        "blocked" in err.detail
      ) {
        const blocked = (
          err.detail as {
            blocked?: { fullName?: string; username?: string }[];
          }
        ).blocked;
        if (blocked && blocked.length > 0) {
          message += ` (${blocked
            .map((item) => item.fullName ?? item.username ?? "peserta")
            .join(", ")})`;
        }
      }

      setExamParticipantsState((previous) =>
        previous
          ? { ...previous, saving: false, error: message }
          : previous,
      );
    }
  }

  async function handleStatus(examId: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/exams/${examId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadExams();
      setNotice(`Status ujian diubah menjadi ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  }

  function examUsageFromError(err: unknown): ExamUsage | null {
    if (
      err instanceof ApiError &&
      err.detail &&
      typeof err.detail === "object" &&
      "usage" in err.detail
    ) {
      return (err.detail as { usage?: ExamUsage }).usage ?? null;
    }
    return null;
  }

  async function openExamCancel(exam: ExamSummary) {
    setError(null);
    setNotice(null);
    setExamCancelState({
      exam,
      usage: null,
      loadingUsage: true,
      cancelling: false,
      error: null,
    });

    try {
      const usage = await api<ExamUsage>(`/exams/${exam.id}/usage`);
      setExamCancelState((previous) =>
        previous && previous.exam.id === exam.id
          ? { ...previous, usage, loadingUsage: false }
          : previous,
      );
    } catch (err) {
      setExamCancelState((previous) =>
        previous && previous.exam.id === exam.id
          ? {
              ...previous,
              loadingUsage: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal memeriksa sesi ujian.",
            }
          : previous,
      );
    }
  }

  async function handleCancelExam() {
    const current = examCancelState;
    if (!current || current.cancelling) return;

    setExamCancelState((previous) =>
      previous ? { ...previous, cancelling: true, error: null } : previous,
    );
    setError(null);

    try {
      await api(`/exams/${current.exam.id}`, { method: "DELETE" });
      setExamCancelState(null);
      setNotice(`Ujian "${current.exam.title}" berhasil dibatalkan.`);

      try {
        await loadExams();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar ujian.",
        );
      }
    } catch (err) {
      const usage = examUsageFromError(err);
      setExamCancelState((previous) =>
        previous
          ? {
              ...previous,
              cancelling: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal membatalkan ujian.",
              usage: usage ?? previous.usage,
            }
          : previous,
      );
    }
  }

  async function handleGrade(session: PendingGradingSession) {
    const grades = session.essays
      .filter((essay) => essay.answerId)
      .map((essay) => ({
        answerId: essay.answerId as string,
        score: Number(gradingDrafts[essay.answerId as string] ?? 0),
      }));

    if (grades.length === 0) {
      setError("Tidak ada jawaban essay yang bisa dinilai.");
      return;
    }
    if (grades.some((grade) => !Number.isFinite(grade.score))) {
      setError("Nilai essay harus berupa angka.");
      return;
    }

    setGradingBusyId(session.sessionId);
    setError(null);
    setNotice(null);
    try {
      const response = await api<{
        score: number;
        gradingStatus: string;
      }>(`/grading/sessions/${session.sessionId}`, {
        method: "POST",
        body: JSON.stringify({ grades }),
      });
      setNotice(
        `Nilai tersimpan. Skor sesi ${session.studentName}: ${response.score} (${response.gradingStatus}).`,
      );
      await loadPendingGrading();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan nilai.");
    } finally {
      setGradingBusyId(null);
    }
  }

  async function handleParticipantImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("mode", participantImportMode);
    setParticipantImporting(true);
    setError(null);
    setNotice(null);
    setParticipantImportResult(null);
    try {
      const result = await apiForm<UserImportResult>(
        "/users/import",
        form,
      );
      setParticipantImportResult(result);
      setNotice(
        `Import peserta selesai: ${result.imported} baru, ${result.updated} diperbarui, ${result.skipped} dilewati, ${result.failed} gagal.`,
      );
      event.currentTarget.reset();
      setParticipantImportMode("skip");
      await loadParticipants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import peserta gagal.");
    } finally {
      setParticipantImporting(false);
    }
  }

  async function handleDownloadParticipantTemplate() {
    setError(null);
    setNotice(null);
    try {
      await apiDownload("/users/template", "template-import-peserta.xlsx");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengunduh template.",
      );
    }
  }

  function openCreateParticipant() {
    setError(null);
    setNotice(null);
    setParticipantEditor({
      mode: "create",
      participant: null,
      saving: false,
      error: null,
    });
  }

  function openEditParticipant(participant: Participant) {
    setError(null);
    setNotice(null);
    setParticipantEditor({
      mode: "edit",
      participant,
      saving: false,
      error: null,
    });
  }

  async function openDeleteParticipant(participant: Participant) {
    setError(null);
    setNotice(null);
    setParticipantDelete({
      participant,
      usage: null,
      loadingUsage: true,
      deleting: false,
      error: null,
    });

    try {
      const usage = await api<ParticipantUsage>(
        `/users/${participant.id}/usage`,
      );
      setParticipantDelete((previous) =>
        previous && previous.participant.id === participant.id
          ? { ...previous, usage, loadingUsage: false }
          : previous,
      );
    } catch (err) {
      setParticipantDelete((previous) =>
        previous && previous.participant.id === participant.id
          ? {
              ...previous,
              loadingUsage: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal memeriksa sesi peserta.",
            }
          : previous,
      );
    }
  }

  function participantUsageFromError(err: unknown): ParticipantUsage | null {
    if (
      err instanceof ApiError &&
      err.detail &&
      typeof err.detail === "object" &&
      "usage" in err.detail
    ) {
      return (err.detail as { usage?: ParticipantUsage }).usage ?? null;
    }
    return null;
  }

  async function handleSaveParticipant(input: ParticipantInput) {
    const current = participantEditor;
    if (!current) return;

    setParticipantEditor((previous) =>
      previous ? { ...previous, saving: true, error: null } : previous,
    );
    setError(null);

    try {
      let successMessage: string;

      if (current.mode === "create") {
        await api("/users", {
          method: "POST",
          body: JSON.stringify(input),
        });
        successMessage = "Peserta berhasil ditambahkan.";
      } else if (current.participant) {
        await api(`/users/${current.participant.id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
        successMessage = "Data peserta berhasil diperbarui.";
      } else {
        throw new Error("Peserta tidak ditemukan.");
      }

      setParticipantEditor(null);
      setNotice(successMessage);

      try {
        await loadParticipants();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar peserta.",
        );
      }
    } catch (err) {
      setParticipantEditor((previous) =>
        previous
          ? {
              ...previous,
              saving: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal menyimpan peserta.",
            }
          : previous,
      );
    }
  }

  async function handleDeleteParticipant() {
    const current = participantDelete;
    if (!current) return;

    setParticipantDelete((previous) =>
      previous ? { ...previous, deleting: true, error: null } : previous,
    );
    setError(null);

    try {
      await api(`/users/${current.participant.id}`, { method: "DELETE" });

      setParticipantDelete(null);
      setNotice("Peserta berhasil dihapus.");

      try {
        await loadParticipants();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat daftar peserta.",
        );
      }
    } catch (err) {
      const usage = participantUsageFromError(err);
      setParticipantDelete((previous) =>
        previous
          ? {
              ...previous,
              deleting: false,
              error:
                err instanceof Error ? err.message : "Gagal menghapus peserta.",
              usage: usage ?? previous.usage,
            }
          : previous,
      );
    }
  }

  async function handleOpenResult(sessionId: string) {
    setResultDetailLoading(true);
    setError(null);
    try {
      const response = await api<ExamResultDetail>(`/results/${sessionId}`);
      setResultDetail(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat detail hasil.",
      );
    } finally {
      setResultDetailLoading(false);
    }
  }

  async function handleExportResults() {
    if (!resultsExamId) {
      setError("Pilih ujian terlebih dahulu sebelum mengekspor nilai.");
      return;
    }

    setExporting(true);
    setError(null);
    setNotice(null);

    try {
      const params = new URLSearchParams({
        examId: resultsExamId,
        mode: exportMode,
      });
      await apiDownload(
        `/results/export?${params.toString()}`,
        exportMode === "category"
          ? "nilai-per-kategori.xlsx"
          : "nilai-ringkasan.xlsx",
      );
      setNotice(
        exportMode === "category"
          ? "Ekspor nilai per kategori berhasil diunduh."
          : "Ekspor ringkasan nilai berhasil diunduh.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengekspor nilai.",
      );
    } finally {
      setExporting(false);
    }
  }

  function openSessionReset(row: ExamResultRow) {
    setError(null);
    setNotice(null);
    setSessionResetState({
      sessionId: row.sessionId,
      studentName: row.studentName,
      username: row.username,
      examTitle: row.examTitle,
      strikeCount: row.strikeCount,
      resetting: false,
      error: null,
    });
  }

  async function handleResetSession() {
    const current = sessionResetState;
    if (!current || current.resetting) return;

    setSessionResetState((previous) =>
      previous ? { ...previous, resetting: true, error: null } : previous,
    );
    setError(null);

    try {
      await api(`/results/${current.sessionId}/reset`, { method: "POST" });
      setSessionResetState(null);
      setNotice(
        `Sesi ${current.studentName} berhasil direset. Peserta dapat login dan melanjutkan ujian.`,
      );

      try {
        await loadResults();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat ulang skor peserta.",
        );
      }

      try {
        await loadExams();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat ulang daftar ujian.",
        );
      }
    } catch (err) {
      setSessionResetState((previous) =>
        previous
          ? {
              ...previous,
              resetting: false,
              error:
                err instanceof Error ? err.message : "Gagal mereset sesi.",
            }
          : previous,
      );
    }
  }

  async function openSessionCancel(row: ExamResultRow) {
    setError(null);
    setNotice(null);
    setSessionCancelState({
      sessionId: row.sessionId,
      usage: null,
      loadingUsage: true,
      cancelling: false,
      error: null,
    });

    try {
      const response = await api<{ usage: SessionCancelUsage }>(
        `/results/${row.sessionId}/usage`,
      );
      setSessionCancelState((previous) =>
        previous && previous.sessionId === row.sessionId
          ? { ...previous, usage: response.usage, loadingUsage: false }
          : previous,
      );
    } catch (err) {
      setSessionCancelState((previous) =>
        previous && previous.sessionId === row.sessionId
          ? {
              ...previous,
              loadingUsage: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal memeriksa sesi peserta.",
            }
          : previous,
      );
    }
  }

  async function handleCancelSession() {
    const current = sessionCancelState;
    const usage = current?.usage;
    if (!current || current.cancelling || !usage?.canCancel) return;

    setSessionCancelState((previous) =>
      previous ? { ...previous, cancelling: true, error: null } : previous,
    );
    setError(null);

    try {
      const response = await api<{
        ok: boolean;
        deletedAnswers: number;
        deletedViolations: number;
        deletedScreenshots: number;
      }>(`/results/${current.sessionId}`, { method: "DELETE" });

      setSessionCancelState(null);
      if (resultDetail?.session.id === current.sessionId) {
        setResultDetail(null);
      }
      setNotice(
        `Submission ${usage.studentName} dibatalkan. ${response.deletedAnswers} jawaban dan sesi peserta dihapus.`,
      );

      try {
        await loadResults();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat ulang skor peserta.",
        );
      }

      try {
        await loadExams();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat ulang daftar ujian.",
        );
      }
    } catch (err) {
      setSessionCancelState((previous) =>
        previous
          ? {
              ...previous,
              cancelling: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Gagal membatalkan submission.",
            }
          : previous,
      );
    }
  }

  function toggleQuestion(questionId: string) {
    setSelectedQuestionIds((previous) =>
      previous.includes(questionId)
        ? previous.filter((id) => id !== questionId)
        : [...previous, questionId],
    );
  }

  const participantTerm = participantSearch.trim().toLowerCase();
  const filteredParticipants = participantTerm
    ? participants.filter(
        (participant) =>
          participant.fullName.toLowerCase().includes(participantTerm) ||
          participant.username.toLowerCase().includes(participantTerm),
      )
    : participants;

  const finishedResults = results.filter((row) => row.status === "finished");
  const totalViolations = results.reduce(
    (sum, row) => sum + row.violationCount,
    0,
  );
  const averageScore =
    finishedResults.length > 0
      ? finishedResults.reduce((sum, row) => sum + Number(row.score ?? 0), 0) /
        finishedResults.length
      : null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Panel Admin
            </p>
            <h1 className="text-lg font-bold text-slate-900">
              {user?.fullName}
            </h1>
          </div>
          <AdminNav
            active={tab}
            onSelect={setTab}
            onLogout={logout}
            isAdmin={user?.role === "admin"}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {notice && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {tab !== "system" && tab !== "teachers" && (
          <div className="card">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <label className="label">Mata pelajaran aktif</label>
                <select
                  className="input"
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                >
                  <option value="">— pilih mapel —</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.code} — {subject.name}
                    </option>
                  ))}
                </select>
              </div>

              {user?.role === "admin" && (
                <form
                  onSubmit={handleCreateSubject}
                  className="flex flex-wrap items-end gap-2"
                >
                  <div>
                    <label className="label">Kode mapel baru</label>
                    <input
                      className="input w-32"
                      value={newSubject.code}
                      onChange={(event) =>
                        setNewSubject((previous) => ({
                          ...previous,
                          code: event.target.value,
                        }))
                      }
                      placeholder="IPA"
                    />
                  </div>
                  <div>
                    <label className="label">Nama</label>
                    <input
                      className="input w-48"
                      value={newSubject.name}
                      onChange={(event) =>
                        setNewSubject((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Ilmu Pengetahuan Alam"
                    />
                  </div>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    type="submit"
                  >
                    Tambah Mapel
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {tab === "bank" && (
          <QuestionBankTab
            busy={busy}
            subjectId={subjectId}
            imports={imports}
            questions={questions}
            uploadingQuestionId={uploadingQuestionId}
            handleImport={handleImport}
            openCreateQuestion={openCreateQuestion}
            openEditQuestion={openEditQuestion}
            openDeleteQuestion={openDeleteQuestion}
            handleUploadImage={handleUploadImage}
          />
        )}

        {tab === "exam" && (
          <ExamTab
            subjects={subjects}
            subjectId={subjectId}
            examForm={examForm}
            setExamForm={setExamForm}
            selectedQuestionIds={selectedQuestionIds}
            setSelectedQuestionIds={setSelectedQuestionIds}
            questions={questions}
            toggleQuestion={toggleQuestion}
            participants={participants}
            selectedParticipantIds={selectedParticipantIds}
            setSelectedParticipantIds={setSelectedParticipantIds}
            busy={busy}
            handleCreateExam={handleCreateExam}
            exams={exams}
            openExamParticipants={openExamParticipants}
            handleStatus={handleStatus}
            openExamCancel={openExamCancel}
          />
        )}
        {tab === "grading" && (
          <GradingTab
            gradingBusyId={gradingBusyId}
            loadPendingGrading={loadPendingGrading}
            pendingGrading={pendingGrading}
            handleGrade={handleGrade}
            gradingDrafts={gradingDrafts}
            setGradingDrafts={setGradingDrafts}
          />
        )}
        {tab === "participants" && (
          <ParticipantsTab
            handleDownloadParticipantTemplate={
              handleDownloadParticipantTemplate
            }
            handleParticipantImport={handleParticipantImport}
            participantImportMode={participantImportMode}
            setParticipantImportMode={setParticipantImportMode}
            participantImporting={participantImporting}
            participantImportResult={participantImportResult}
            filteredParticipants={filteredParticipants}
            participants={participants}
            participantSearch={participantSearch}
            setParticipantSearch={setParticipantSearch}
            openCreateParticipant={openCreateParticipant}
            openEditParticipant={openEditParticipant}
            openDeleteParticipant={openDeleteParticipant}
          />
        )}
        {tab === "results" && (
          <ResultsTab
            exportMode={exportMode}
            setExportMode={setExportMode}
            resultsExamId={resultsExamId}
            exporting={exporting}
            handleExportResults={handleExportResults}
            resultsLoading={resultsLoading}
            loadResults={loadResults}
            setResultsExamId={setResultsExamId}
            exams={exams}
            resultsStatus={resultsStatus}
            setResultsStatus={setResultsStatus}
            resultsSearch={resultsSearch}
            setResultsSearch={setResultsSearch}
            results={results}
            finishedResults={finishedResults}
            totalViolations={totalViolations}
            averageScore={averageScore}
            user={user}
            resultDetailLoading={resultDetailLoading}
            handleOpenResult={handleOpenResult}
            openSessionReset={openSessionReset}
            openSessionCancel={openSessionCancel}
          />
        )}

        {tab === "teachers" && user?.role === "admin" && <TeacherTab />}

        {tab === "system" && user?.role === "admin" && <SystemPanel />}
      </main>

      {resultDetailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30">
          <div className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow">
            Memuat detail...
          </div>
        </div>
      )}

      <ResultDetailModal
        resultDetail={resultDetail}
        onClose={() => setResultDetail(null)}
      />

      {questionEditor && (
        <QuestionEditorModal
          key={questionEditor.question?.id ?? "new"}
          mode={questionEditor.mode}
          subjectId={subjectId}
          question={questionEditor.question}
          usage={questionEditor.usage}
          loadingUsage={questionEditor.loadingUsage}
          saving={questionEditor.saving}
          serverError={questionEditor.error}
          onClose={() => setQuestionEditor(null)}
          onSubmit={handleSaveQuestion}
        />
      )}

      {questionDelete && (
        <QuestionDeleteDialog
          question={questionDelete.question}
          usage={questionDelete.usage}
          loadingUsage={questionDelete.loadingUsage}
          deleting={questionDelete.deleting}
          error={questionDelete.error}
          onClose={() => setQuestionDelete(null)}
          onConfirm={() => void handleDeleteQuestion()}
        />
      )}

      {participantEditor && (
        <ParticipantEditorModal
          key={participantEditor.participant?.id ?? "new"}
          mode={participantEditor.mode}
          participant={participantEditor.participant}
          saving={participantEditor.saving}
          serverError={participantEditor.error}
          onClose={() => setParticipantEditor(null)}
          onSubmit={handleSaveParticipant}
        />
      )}

      {participantDelete && (
        <ParticipantDeleteDialog
          participant={participantDelete.participant}
          usage={participantDelete.usage}
          loadingUsage={participantDelete.loadingUsage}
          deleting={participantDelete.deleting}
          error={participantDelete.error}
          onClose={() => setParticipantDelete(null)}
          onConfirm={() => void handleDeleteParticipant()}
        />
      )}

      {examParticipantsState && (
        <ExamParticipantsModal
          key={examParticipantsState.exam.id}
          exam={examParticipantsState.exam}
          participants={examParticipantsState.participants}
          loading={examParticipantsState.loading}
          saving={examParticipantsState.saving}
          error={examParticipantsState.error}
          onClose={() => setExamParticipantsState(null)}
          onSave={handleSaveExamParticipants}
        />
      )}

      {examCancelState && (
        <ExamCancelDialog
          key={examCancelState.exam.id}
          exam={examCancelState.exam}
          usage={examCancelState.usage}
          loadingUsage={examCancelState.loadingUsage}
          cancelling={examCancelState.cancelling}
          error={examCancelState.error}
          onClose={() => setExamCancelState(null)}
          onConfirm={() => void handleCancelExam()}
        />
      )}

      {sessionResetState && (
        <SessionResetDialog
          key={sessionResetState.sessionId}
          studentName={sessionResetState.studentName}
          username={sessionResetState.username}
          examTitle={sessionResetState.examTitle}
          strikeCount={sessionResetState.strikeCount}
          resetting={sessionResetState.resetting}
          error={sessionResetState.error}
          onClose={() => setSessionResetState(null)}
          onConfirm={() => void handleResetSession()}
        />
      )}

      {sessionCancelState && (
        <SessionCancelDialog
          key={sessionCancelState.sessionId}
          usage={sessionCancelState.usage}
          loadingUsage={sessionCancelState.loadingUsage}
          cancelling={sessionCancelState.cancelling}
          error={sessionCancelState.error}
          onClose={() => setSessionCancelState(null)}
          onConfirm={() => void handleCancelSession()}
        />
      )}

      {examCreateConfirm && (
        <ExamCreateDialog
          subjectName={
            subjects.find((subject) => subject.id === subjectId)?.name ??
            "belum dipilih"
          }
          title={examForm.title.trim()}
          description={examForm.description.trim()}
          durationMinutes={Number(examForm.durationMinutes)}
          maxStrikes={Number(examForm.maxStrikes)}
          shuffleQuestions={examForm.shuffleQuestions}
          shuffleOptions={examForm.shuffleOptions}
          publish={examForm.publish}
          questionCount={selectedQuestionIds.length}
          participantCount={selectedParticipantIds.length}
          saving={examCreateConfirm.saving}
          error={examCreateConfirm.error}
          onClose={() => setExamCreateConfirm(null)}
          onConfirm={() => void handleConfirmCreateExam()}
        />
      )}

      {toast && (
        <Toast
          key={toast.id}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
