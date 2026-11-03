import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, apiDownload, apiForm, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import AdminNav from "../components/AdminNav";
import ExamCreateDialog from "../components/ExamCreateDialog";
import ExamCancelDialog from "../components/ExamCancelDialog";
import ExamParticipantsModal from "../components/ExamParticipantsModal";
import ParticipantPicker from "../components/ParticipantPicker";
import QuestionDeleteDialog from "../components/QuestionDeleteDialog";
import QuestionEditorModal from "../components/QuestionEditorModal";
import ParticipantDeleteDialog from "../components/ParticipantDeleteDialog";
import ParticipantEditorModal from "../components/ParticipantEditorModal";
import SessionResetDialog from "../components/SessionResetDialog";
import SystemPanel from "../components/SystemPanel";
import Toast from "../components/Toast";
import type {
  AdminQuestion,
  AdminTab,
  ExamParticipantRow,
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
  Subject,
  UserImportResult,
} from "../lib/types";

type ImportRow = {
  id: string;
  subjectId: string;
  format: string;
  originalFilename: string | null;
  status: string;
  totalQuestions: number;
  importedQuestions: number;
  createdAt: string;
};

type QuestionEditorState = {
  mode: "create" | "edit";
  question: AdminQuestion | null;
  usage: QuestionUsage | null;
  loadingUsage: boolean;
  saving: boolean;
  error: string | null;
};

type QuestionDeleteState = {
  question: AdminQuestion;
  usage: QuestionUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
};

type ParticipantEditorState = {
  mode: "create" | "edit";
  participant: Participant | null;
  saving: boolean;
  error: string | null;
};

type ParticipantDeleteState = {
  participant: Participant;
  usage: ParticipantUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
};

type ExamCreateConfirmState = {
  saving: boolean;
  error: string | null;
};

type ToastState = {
  id: number;
  title: string;
  message?: string;
};

type ExamParticipantsState = {
  exam: ExamSummary;
  participants: ExamParticipantRow[] | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

type ExamCancelState = {
  exam: ExamSummary;
  usage: ExamUsage | null;
  loadingUsage: boolean;
  cancelling: boolean;
  error: string | null;
};

type SessionResetState = {
  sessionId: string;
  studentName: string;
  username: string;
  examTitle: string;
  strikeCount: number;
  resetting: boolean;
  error: string | null;
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>("bank");

  useEffect(() => {
    if (tab === "system" && user?.role !== "admin") {
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

  const [examForm, setExamForm] = useState({
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

        {tab !== "system" && (
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
                <button className="btn-secondary" disabled={busy} type="submit">
                  Tambah Mapel
                </button>
              </form>
            </div>
          </div>
        )}

        {tab === "bank" && (
          <>
            <section className="card">
              <h2 className="text-base font-bold text-slate-900">
                Import Soal AIKEN / GIFT
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                File .txt berisi soal. Soal akan ditambahkan ke mapel aktif.
              </p>

              <form
                onSubmit={handleImport}
                className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]"
              >
                <div>
                  <label className="label">Format</label>
                  <select name="format" className="input" defaultValue="gift">
                    <option value="gift">GIFT</option>
                    <option value="aiken">AIKEN</option>
                  </select>
                </div>

                <div>
                  <label className="label">File soal</label>
                  <input
                    type="file"
                    name="file"
                    accept=".txt,text/plain"
                    className="input py-2"
                    required
                  />
                </div>

                <input type="hidden" name="subjectId" value={subjectId} />

                <div className="flex items-end">
                  <button
                    className="btn-primary w-full"
                    type="submit"
                    disabled={busy || !subjectId}
                  >
                    {busy ? "Mengimpor..." : "Import"}
                  </button>
                </div>
              </form>

              {imports.length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="pb-2">File</th>
                        <th className="pb-2">Format</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Soal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {imports.slice(0, 8).map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 pr-3 text-slate-700">
                            {row.originalFilename ?? "-"}
                          </td>
                          <td className="py-2 pr-3 uppercase text-slate-500">
                            {row.format}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2 text-slate-500">
                            {row.importedQuestions}/{row.totalQuestions}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Soal ({questions.length})
                </h2>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openCreateQuestion}
                  disabled={!subjectId}
                >
                  Tambah Soal
                </button>
              </div>

              {questions.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">
                  Belum ada soal untuk mapel ini.
                </p>
              )}

              <div className="mt-3 space-y-2">
                {questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
                        {question.questionType}
                      </span>
                      <span>{question.points} poin</span>
                      {question.category && <span>· {question.category}</span>}
                      <span>· {question.sourceFormat}</span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => void openEditQuestion(question)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 px-2 py-1 font-semibold text-rose-600 hover:bg-rose-50"
                          onClick={() => void openDeleteQuestion(question)}
                        >
                          Hapus
                        </button>
                        <label className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 font-semibold text-brand-600 hover:bg-slate-50">
                          {uploadingQuestionId === question.id
                            ? "Mengunggah..."
                            : question.imageUrl
                              ? "Ganti gambar"
                              : "Upload gambar"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={uploadingQuestionId !== null}
                            onChange={(event) => {
                              void handleUploadImage(
                                question.id,
                                event.target.files?.[0] ?? null,
                              );
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-800">
                      {index + 1}. {stripHtml(question.questionText)}
                    </p>
                    {question.imageUrl && (
                      <img
                        src={question.imageUrl}
                        alt="Gambar soal"
                        className="mt-2 max-h-32 rounded-lg border border-slate-200 object-contain"
                      />
                    )}
                    {question.options.length > 0 && (
                      <ul className="mt-1 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                        {question.options.map((option) => (
                          <li key={option.id}>
                            <span className="font-semibold">
                              {option.label}.
                            </span>{" "}
                            {stripHtml(option.optionText ?? "")}
                            {Number(option.fraction) > 0 && (
                              <span className="ml-1 font-semibold text-emerald-600">
                                ✓
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === "exam" && (
          <>
            <section className="card">
              <h2 className="text-base font-bold text-slate-900">
                Buat Ujian Baru
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Mapel aktif:{" "}
                {subjects.find((subject) => subject.id === subjectId)?.name ??
                  "belum dipilih"}
                . Pilih soal dari daftar di bawah.
              </p>

              <form onSubmit={handleCreateExam} className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Judul ujian</label>
                    <input
                      className="input"
                      value={examForm.title}
                      onChange={(event) =>
                        setExamForm((previous) => ({
                          ...previous,
                          title: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Durasi (menit)</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={examForm.durationMinutes}
                      onChange={(event) =>
                        setExamForm((previous) => ({
                          ...previous,
                          durationMinutes: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Maks. pelanggaran</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={examForm.maxStrikes}
                      onChange={(event) =>
                        setExamForm((previous) => ({
                          ...previous,
                          maxStrikes: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-4 text-sm text-slate-600">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={examForm.shuffleQuestions}
                        onChange={(event) =>
                          setExamForm((previous) => ({
                            ...previous,
                            shuffleQuestions: event.target.checked,
                          }))
                        }
                      />
                      Acak soal
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={examForm.shuffleOptions}
                        onChange={(event) =>
                          setExamForm((previous) => ({
                            ...previous,
                            shuffleOptions: event.target.checked,
                          }))
                        }
                      />
                      Acak opsi
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={examForm.publish}
                        onChange={(event) =>
                          setExamForm((previous) => ({
                            ...previous,
                            publish: event.target.checked,
                          }))
                        }
                      />
                      Langsung publikasikan
                    </label>
                  </div>
                </div>

                <div>
                  <label className="label">Deskripsi (opsional)</label>
                  <textarea
                    className="input min-h-20"
                    value={examForm.description}
                    onChange={(event) =>
                      setExamForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">
                      Pilih soal ({selectedQuestionIds.length} dipilih)
                    </p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand-600"
                      onClick={() =>
                        setSelectedQuestionIds(
                          questions.map((question) => question.id),
                        )
                      }
                    >
                      Pilih semua
                    </button>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                    {questions.length === 0 && (
                      <p className="p-2 text-sm text-slate-500">
                        Belum ada soal. Import soal terlebih dahulu.
                      </p>
                    )}
                    {questions.map((question, index) => (
                      <label
                        key={question.id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedQuestionIds.includes(question.id)}
                          onChange={() => toggleQuestion(question.id)}
                        />
                        <span className="text-slate-700">
                          {index + 1}. {stripHtml(question.questionText)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">
                      Peserta ujian ({selectedParticipantIds.length} dipilih)
                    </p>
                  </div>

                  <ParticipantPicker
                    participants={participants}
                    selectedIds={selectedParticipantIds}
                    onChange={setSelectedParticipantIds}
                    emptyMessage="Belum ada akun peserta. Tambahkan peserta di tab Peserta."
                  />

                  {selectedParticipantIds.length === 0 && (
                    <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Belum ada peserta dipilih. Ujian yang dipublikasikan tidak
                      akan muncul bagi siswa sampai peserta ditambahkan.
                    </p>
                  )}
                </div>

                <button
                  className="btn-primary"
                  type="submit"
                  disabled={busy || !subjectId}
                >
                  {busy ? "Menyimpan..." : "Buat Ujian"}
                </button>
              </form>
            </section>

            <section className="card">
              <h2 className="text-base font-bold text-slate-900">
                Daftar Ujian
              </h2>
              <div className="mt-3 space-y-2">
                {exams.length === 0 && (
                  <p className="text-sm text-slate-500">Belum ada ujian.</p>
                )}
                {exams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {exam.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {exam.subjectName ?? "-"} · {exam.durationMinutes} menit
                        · status: {exam.status} ·{" "}
                        {exam.participantCount ?? 0} peserta
                        {exam.status === "published" &&
                          (exam.participantCount ?? 0) === 0 && (
                            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              Belum ada peserta
                            </span>
                          )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => void openExamParticipants(exam)}
                      >
                        Peserta
                      </button>
                      {exam.status !== "published" && (
                        <button
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => void handleStatus(exam.id, "published")}
                        >
                          Publikasikan
                        </button>
                      )}
                      {exam.status === "published" && (
                        <button
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => void handleStatus(exam.id, "archived")}
                        >
                          Arsipkan
                        </button>
                      )}
                      <button
                        className="btn-danger"
                        disabled={busy}
                        onClick={() => void openExamCancel(exam)}
                      >
                        Batalkan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {tab === "grading" && (
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Penilaian Essay
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sesi dengan jawaban essay yang belum dinilai manual.
                </p>
              </div>
              <button
                className="btn-secondary"
                disabled={gradingBusyId !== null}
                onClick={() => void loadPendingGrading()}
              >
                Muat ulang
              </button>
            </div>

            {pendingGrading.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                Tidak ada sesi yang menunggu penilaian essay.
              </p>
            )}

            <div className="mt-4 space-y-4">
              {pendingGrading.map((session) => (
                <div
                  key={session.sessionId}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {session.studentName}{" "}
                        <span className="text-xs font-normal text-slate-400">
                          ({session.username})
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {session.examTitle} · skor otomatis:{" "}
                        {session.score ?? "0"} · status:{" "}
                        {session.gradingStatus}
                      </p>
                    </div>
                    <button
                      className="btn-primary"
                      disabled={gradingBusyId !== null}
                      onClick={() => void handleGrade(session)}
                    >
                      {gradingBusyId === session.sessionId
                        ? "Menyimpan..."
                        : "Simpan Nilai"}
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {session.essays.map((essay, index) => (
                      <div
                        key={essay.questionId}
                        className="rounded-lg bg-slate-50 p-3"
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {index + 1}. {stripHtml(essay.questionText)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2 text-sm text-slate-700">
                          {essay.answerText || "(tidak dijawab)"}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Nilai (maks {essay.points})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={Number(essay.points)}
                            step="0.01"
                            className="input w-28"
                            disabled={!essay.answerId}
                            value={
                              essay.answerId
                                ? gradingDrafts[essay.answerId] ?? ""
                                : ""
                            }
                            onChange={(event) => {
                              if (!essay.answerId) return;
                              setGradingDrafts((previous) => ({
                                ...previous,
                                [essay.answerId as string]: event.target.value,
                              }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {tab === "participants" && (
          <>
            <section className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Import Peserta (Excel)
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Unduh template, isi data peserta, lalu unggah kembali. Password
                    akan di-hash otomatis dan tidak pernah disimpan sebagai teks
                    biasa.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleDownloadParticipantTemplate()}
                >
                  Unduh Template Excel
                </button>
              </div>

              <form
                onSubmit={handleParticipantImport}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]"
              >
                <div>
                  <label className="label">File Excel (.xlsx)</label>
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700"
                    required
                  />
                </div>
                <div>
                  <label className="label">Jika username sudah ada</label>
                  <select
                    className="input"
                    value={participantImportMode}
                    onChange={(event) =>
                      setParticipantImportMode(
                        event.target.value === "update" ? "update" : "skip",
                      )
                    }
                  >
                    <option value="skip">Lewati (aman)</option>
                    <option value="update">Perbarui data peserta</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={participantImporting}
                  >
                    {participantImporting ? "Mengimport..." : "Import Peserta"}
                  </button>
                </div>
              </form>

              {participantImportResult && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Ringkasan import
                  </p>
                  <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-5">
                    <p>Total baris: {participantImportResult.totalRows}</p>
                    <p>Baru: {participantImportResult.imported}</p>
                    <p>Diperbarui: {participantImportResult.updated}</p>
                    <p>Dilewati: {participantImportResult.skipped}</p>
                    <p>Gagal: {participantImportResult.failed}</p>
                  </div>

                  {participantImportResult.errors.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                            <th className="py-2 pr-4">Baris</th>
                            <th className="py-2 pr-4">Username</th>
                            <th className="py-2">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {participantImportResult.errors.map((error, index) => (
                            <tr
                              key={`${error.row}-${index}`}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="py-2 pr-4">{error.row}</td>
                              <td className="py-2 pr-4 font-mono text-xs">
                                {error.username || "-"}
                              </td>
                              <td className="py-2 text-rose-700">
                                {error.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Daftar Peserta
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {filteredParticipants.length} dari {participants.length}{" "}
                    peserta ditampilkan.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input max-w-xs"
                    value={participantSearch}
                    onChange={(event) =>
                      setParticipantSearch(event.target.value)
                    }
                    placeholder="Cari nama atau username"
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={openCreateParticipant}
                  >
                    Tambah Peserta
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-4">Username</th>
                      <th className="py-2 pr-4">Nama Lengkap</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Dibuat</th>
                      <th className="py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.map((participant) => (
                      <tr
                        key={participant.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4 font-mono text-xs text-slate-600">
                          {participant.username}
                        </td>
                        <td className="py-2 pr-4 text-slate-800">
                          {participant.fullName}
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              participant.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {participant.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {formatDateTime(participant.createdAt)}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              onClick={() => openEditParticipant(participant)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              onClick={() =>
                                void openDeleteParticipant(participant)
                              }
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredParticipants.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-4 text-center text-sm text-slate-500"
                        >
                          Tidak ada peserta yang cocok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {tab === "results" && (
          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Skor Peserta
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Rekap nilai, status pengerjaan, dan jumlah pelanggaran per sesi
                  ujian. Ekspor Excel memuat sesi yang sudah selesai.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <select
                  className="input w-56"
                  value={exportMode}
                  onChange={(event) =>
                    setExportMode(
                      event.target.value === "category" ? "category" : "summary",
                    )
                  }
                  disabled={!resultsExamId || exporting}
                  aria-label="Format ekspor nilai"
                >
                  <option value="summary">Ringkasan per peserta</option>
                  <option value="category">Per kategori soal</option>
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!resultsExamId || exporting}
                  onClick={() => void handleExportResults()}
                >
                  {exporting ? "Menyiapkan..." : "Ekspor Excel"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={resultsLoading || exporting}
                  onClick={() => void loadResults()}
                >
                  {resultsLoading ? "Memuat..." : "Muat ulang"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Ujian</label>
                <select
                  className="input"
                  value={resultsExamId}
                  onChange={(event) => setResultsExamId(event.target.value)}
                >
                  <option value="">— pilih ujian —</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status pengerjaan</label>
                <select
                  className="input"
                  value={resultsStatus}
                  onChange={(event) => setResultsStatus(event.target.value)}
                >
                  <option value="all">Semua</option>
                  <option value="finished">Selesai</option>
                  <option value="in_progress">Sedang berjalan</option>
                  <option value="suspended">Ditangguhkan</option>
                </select>
              </div>
              <div>
                <label className="label">Cari peserta</label>
                <input
                  className="input"
                  value={resultsSearch}
                  onChange={(event) => setResultsSearch(event.target.value)}
                  placeholder="Nama atau username"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Sesi
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {results.length}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Selesai
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-800">
                  {finishedResults.length}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Berjalan
                </p>
                <p className="mt-1 text-xl font-bold text-amber-800">
                  {results.length - finishedResults.length}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Pelanggaran
                </p>
                <p className="mt-1 text-xl font-bold text-rose-800">
                  {totalViolations}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Rata-rata
                </p>
                <p className="mt-1 text-xl font-bold text-brand-800">
                  {averageScore === null ? "-" : averageScore.toFixed(2)}
                </p>
              </div>
            </div>

            {!resultsExamId && (
              <p className="mt-4 text-sm text-slate-500">
                Pilih ujian untuk melihat skor peserta.
              </p>
            )}

            {resultsExamId && !resultsLoading && results.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                Belum ada sesi peserta untuk ujian ini.
              </p>
            )}

            {results.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-4">Peserta</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Skor</th>
                      <th className="py-2 pr-4">Pelanggaran</th>
                      <th className="py-2 pr-4">Selesai</th>
                      <th className="py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr
                        key={row.sessionId}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4">
                          <p className="font-semibold text-slate-800">
                            {row.studentName}
                          </p>
                          <p className="font-mono text-xs text-slate-500">
                            {row.username}
                          </p>
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              row.status === "finished"
                                ? "bg-emerald-50 text-emerald-700"
                                : row.status === "suspended"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {statusLabel(row.status)}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            {gradingLabel(row.gradingStatus)}
                          </span>
                          {row.finishedReason === "force_submit" && (
                            <span className="mt-1 block text-xs font-semibold text-rose-600">
                              Dikumpulkan paksa
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="font-semibold text-slate-800">
                            {row.score ?? "0"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {" "}
                            / {row.maxScore}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={
                              row.violationCount > 0
                                ? "font-semibold text-rose-700"
                                : "text-slate-500"
                            }
                          >
                            {row.violationCount} total
                          </span>
                          <span className="block text-xs text-slate-500">
                            {row.strikeCount} strike
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {formatDateTime(row.finishedAt)}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={resultDetailLoading}
                              onClick={() => void handleOpenResult(row.sessionId)}
                            >
                              Detail
                            </button>
                            {user?.role === "admin" &&
                              row.status === "finished" &&
                              row.finishedReason === "force_submit" && (
                                <button
                                  type="button"
                                  className="rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                                  onClick={() => openSessionReset(row)}
                                >
                                  Reset
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "system" && user?.role === "admin" && <SystemPanel />}
      </main>

      {resultDetailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30">
          <div className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow">
            Memuat detail...
          </div>
        </div>
      )}

      {resultDetail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="my-6 w-full max-w-4xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  Detail Hasil
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  {resultDetail.session.studentName}
                </h2>
                <p className="text-sm text-slate-500">
                  {resultDetail.session.username} ·{" "}
                  {resultDetail.session.examTitle}
                  {resultDetail.session.subjectName
                    ? ` · ${resultDetail.session.subjectName}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setResultDetail(null)}
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Skor
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {resultDetail.session.score ?? "0"} /{" "}
                  {resultDetail.session.maxScore}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Total pelanggaran
                </p>
                <p className="mt-1 text-lg font-bold text-rose-800">
                  {resultDetail.session.violationCount}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Strike
                </p>
                <p className="mt-1 text-lg font-bold text-amber-800">
                  {resultDetail.session.strikeCount}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Status
                </p>
                <p className="mt-1 text-lg font-bold text-brand-800">
                  {statusLabel(resultDetail.session.status)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">
                Pelanggaran ({resultDetail.violations.length})
              </h3>
              {resultDetail.violations.length === 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  Tidak ada pelanggaran tercatat.
                </p>
              )}
              <div className="mt-2 space-y-2">
                {resultDetail.violations.map((violation) => (
                  <div
                    key={violation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50/60 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-rose-800">
                        {violationLabel(violation.violationType)}
                      </p>
                      <p className="text-xs text-rose-700/80">
                        {formatDateTime(violation.timestamp)} · strike{" "}
                        {violation.strikeNumber}
                      </p>
                    </div>
                    {violation.screenshotUrl && (
                      <a
                        className="text-xs font-semibold text-brand-700 underline"
                        href={violation.screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Lihat bukti
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">
                Jawaban ({resultDetail.answers.length}/
                {resultDetail.questions.length})
              </h3>
              <div className="mt-2 space-y-3">
                {resultDetail.questions.map((question) => {
                  const answer = resultDetail.answers.find(
                    (item) => item.questionId === question.id,
                  );
                  return (
                    <div
                      key={question.id}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          {question.orderIndex}. {stripHtml(question.questionText)}
                        </p>
                        <span className="text-xs font-semibold text-slate-500">
                          {answer?.scoreAwarded ?? "-"} / {question.points}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                        {renderAnswerText(question, answer)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        {answer?.isFlagged && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                            Ditandai
                          </span>
                        )}
                        {question.questionType === "essay" &&
                          answer?.scoreAwarded === null && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                              Belum dinilai
                            </span>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID");
}

function statusLabel(status: string): string {
  switch (status) {
    case "started":
      return "Dimulai";
    case "in_progress":
      return "Sedang berjalan";
    case "finished":
      return "Selesai";
    case "suspended":
      return "Ditangguhkan";
    default:
      return status;
  }
}

function gradingLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Menunggu";
    case "partial":
      return "Sebagian";
    case "completed":
      return "Lengkap";
    default:
      return status;
  }
}

function violationLabel(type: string): string {
  switch (type) {
    case "tab_hidden":
      return "Tab tidak aktif";
    case "window_blur":
      return "Jendela keluar fokus";
    case "fullscreen_exit":
      return "Keluar layar penuh";
    case "dom_injection":
      return "Upaya injeksi";
    case "contextmenu":
      return "Klik kanan";
    case "copy_paste":
      return "Salin/tempel";
    case "keyboard_shortcut":
      return "Pintasan keyboard";
    default:
      return type;
  }
}

function renderAnswerText(
  question: ExamResultDetail["questions"][number],
  answer: ExamResultDetail["answers"][number] | undefined,
): string {
  if (!answer) return "(tidak dijawab)";

  if (question.questionType === "multiple_choice") {
    const option = question.options.find(
      (item) => item.id === answer.selectedOptionId,
    );
    if (option) {
      const text = option.optionText ? stripHtml(option.optionText) : "";
      return `${option.label}. ${text}`.trim();
    }
  }

  if (question.questionType === "multiple_response") {
    const payload = answer.answerPayload ?? {};
    const ids = Array.isArray((payload as Record<string, unknown>).option_ids)
      ? ((payload as Record<string, unknown>).option_ids as string[])
      : [];
    if (ids.length === 0 && answer.selectedOptionId) ids.push(answer.selectedOptionId);
    const labels = question.options
      .filter((item) => ids.includes(item.id))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((item) => {
        const text = item.optionText ? stripHtml(item.optionText) : "";
        return `${item.label}. ${text}`.trim();
      });
    return labels.length > 0 ? labels.join("; ") : "(tidak dijawab)";
  }

  if (question.questionType === "true_false") {
    if (answer.selectedOptionId) {
      const option = question.options.find(
        (item) => item.id === answer.selectedOptionId,
      );
      return option?.label ?? answer.selectedOptionId;
    }
  }

  if (question.questionType === "matching") {
    const payload = answer.answerPayload ?? {};
    const mapping =
      payload.mapping && typeof payload.mapping === "object"
        ? (payload.mapping as Record<string, string>)
        : {};
    const entries = question.matchPairs
      .map((pair) => {
        const rightId = mapping[pair.id];
        const right = question.matchPairs.find((item) => item.id === rightId);
        if (rightId && right) {
          return `${stripHtml(pair.leftText)} -> ${stripHtml(right.rightText)}`;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
    return entries.length > 0 ? entries.join("; ") : "(tidak dijawab)";
  }

  if (question.questionType === "short_answer") {
    const text = answerPayloadText(answer);
    if (text) return text;
  }

  if (question.questionType === "numerical") {
    const payload = answer.answerPayload ?? {};
    const value = (payload as Record<string, unknown>).value;
    if (value !== undefined && value !== null && String(value).trim())
      return String(value);
  }

  if (question.questionType === "essay") {
    const text = answerPayloadText(answer);
    if (text) return text;
  }

  if (answer.selectedOptionId) {
    const option = question.options.find(
      (item) => item.id === answer.selectedOptionId,
    );
    return option?.optionText
      ? stripHtml(option.optionText)
      : option?.label ?? answer.selectedOptionId;
  }

  return "(tidak dijawab)";
}

function answerPayloadText(
  answer: ExamResultDetail["answers"][number] | undefined,
): string {
  const payload = (answer?.answerPayload ?? {}) as Record<string, unknown>;
  // Frontend menyimpan jawaban teks sebagai { text }; { value } dipertahankan
  // sebagai fallback untuk data lama.
  for (const key of ["text", "value"] as const) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
