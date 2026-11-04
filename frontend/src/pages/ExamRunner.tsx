import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import QuestionCard from "../components/QuestionCard";
import { api, apiForm, clearToken } from "../lib/api";
import {
  captureExamScreenshot,
  enterFullscreen,
  exitFullscreen,
  installInteractionGuards,
  installMutationGuard,
  lockKeyboard,
  STRIKE_TYPES,
  unlockKeyboard,
} from "../lib/anticheat";
import { formatTime, isAnswered, parseAnswers } from "../lib/exam-utils";
import type {
  AnswerState,
  ExamSummary,
  SessionPayload,
  SessionQuestion,
  ViolationResponse,
  ViolationType,
} from "../lib/types";

const VIOLATION_MESSAGE: Record<ViolationType, string> = {
  tab_hidden: "Anda berpindah tab atau aplikasi. Ujian dikunci sementara.",
  window_blur: "Jendela ujian kehilangan fokus. Ujian dikunci sementara.",
  fullscreen_exit: "Anda keluar dari mode layar penuh.",
  dom_injection:
    "Terdeteksi elemen asing yang disuntikkan ekstensi browser ke halaman ujian.",
  contextmenu: "Klik kanan dilarang.",
  copy_paste: "Seleksi, copy, cut, dan paste dilarang.",
  keyboard_shortcut: "Pintasan keyboard tersebut dilarang.",
};

type OverlayState =
  | { kind: "violation"; title: string; message: string; strikes: number }
  | { kind: "forced"; title: string; message: string; strikes: number }
  | { kind: "confirm"; title: string; message: string; strikes: number }
  | { kind: "reconnect"; title: string; message: string; strikes: number };

type ResultState = {
  score: number;
  gradingStatus: string;
  finishedReason: string;
};

const examStorageKey = (examId: string) => `cbt_exam_${examId}`;
const pendingStorageKey = (sessionId: string) => `cbt_pending_${sessionId}`;

export default function ExamRunnerPage() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();

  const [examInfo, setExamInfo] = useState<ExamSummary | null>(null);
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [strikes, setStrikes] = useState(0);
  const [current, setCurrent] = useState(0);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef("");
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const overlayRef = useRef(false);
  const overlayStateRef = useRef<OverlayState | null>(null);
  const submittingRef = useRef(false);
  const violationLockRef = useRef(0);
  const strikesRef = useRef(0);
  const answersRef = useRef<Record<string, AnswerState>>({});
  const captureLockRef = useRef(false);
  const textTimersRef = useRef<Record<string, number>>({});
  const pendingTextRef = useRef<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    overlayStateRef.current = overlay;
  }, [overlay]);

  useEffect(() => {
    api<{ exams: ExamSummary[] }>("/exams")
      .then((response) => {
        const found =
          response.exams.find((exam) => exam.id === examId) ?? null;
        setExamInfo(found);
        if (!found) {
          setError(
            "Ujian tidak tersedia atau Anda belum terdaftar pada ujian ini.",
          );
        }
      })
      .catch(() => {
        setExamInfo(null);
        setError("Gagal memuat informasi ujian.");
      });
  }, [examId]);

  const enqueuePending = useCallback(
    (questionId: string, patch: Partial<AnswerState>) => {
      if (!sessionIdRef.current) return;
      const key = pendingStorageKey(sessionIdRef.current);
      try {
        const raw = localStorage.getItem(key);
        const queue = raw
          ? (JSON.parse(raw) as {
              questionId: string;
              patch: Partial<AnswerState>;
            }[])
          : [];
        queue.push({ questionId, patch });
        localStorage.setItem(key, JSON.stringify(queue));
      } catch {
        // ignore storage errors
      }
    },
    [],
  );

  const flushPending = useCallback(async (): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return true;

    const key = pendingStorageKey(sessionId);
    const raw = localStorage.getItem(key);
    if (!raw) return true;

    let queue: { questionId: string; patch: Partial<AnswerState> }[] = [];
    try {
      queue = JSON.parse(raw);
    } catch {
      return true;
    }

    const failed: typeof queue = [];
    for (const item of queue) {
      try {
        await api(`/sessions/${sessionId}/answers/${item.questionId}`, {
          method: "PUT",
          body: JSON.stringify(item.patch),
        });
      } catch {
        failed.push(item);
      }
    }

    if (failed.length > 0) {
      localStorage.setItem(key, JSON.stringify(failed));
      return false;
    }

    localStorage.removeItem(key);
    return true;
  }, []);

  const saveAnswer = useCallback(
    async (questionId: string, patch: Partial<AnswerState>) => {
      setAnswers((previous) => {
        const base = previous[questionId] ?? {
          selectedOptionId: null,
          answerPayload: null,
          isFlagged: false,
        };
        const next = {
          ...previous,
          [questionId]: { ...base, ...patch },
        };
        answersRef.current = next;
        return next;
      });

      if (!sessionIdRef.current) return;

      try {
        await api(`/sessions/${sessionIdRef.current}/answers/${questionId}`, {
          method: "PUT",
          body: JSON.stringify(patch),
        });
      } catch {
        enqueuePending(questionId, patch);
        setOnline(false);
      }
    },
    [enqueuePending],
  );

  /**
   * Kirim segera perubahan teks yang masih menunggu debounce, supaya jawaban
   * terakhir tidak hilang ketika peserta langsung mengumpulkan atau reconnect.
   */
  const flushTextTimers = useCallback(async () => {
    for (const [questionId, payload] of Object.entries(
      pendingTextRef.current,
    )) {
      const timer = textTimersRef.current[questionId];
      if (timer) window.clearTimeout(timer);
      delete textTimersRef.current[questionId];
      delete pendingTextRef.current[questionId];
      await saveAnswer(questionId, { answerPayload: payload });
    }
  }, [saveAnswer]);

  const submitExam = useCallback(
    async (auto = false) => {
      if (submittingRef.current) return;

      if (!auto) {
        overlayRef.current = true;
        setOverlay({
          kind: "confirm",
          title: "Kumpulkan jawaban?",
          message:
            "Setelah dikumpulkan, jawaban tidak dapat diubah lagi. Pastikan semua soal sudah diperiksa.",
          strikes: strikesRef.current,
        });
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      try {
        // Pastikan jawaban yang tertunda (debounce teks & antrean offline)
        // dikirim sebelum sesi difinalisasi oleh server.
        await flushTextTimers();
        await flushPending();

        const response = await api<ResultState>(
          `/sessions/${sessionIdRef.current}/submit`,
          { method: "POST" },
        );
        setResult(response);
        activeRef.current = false;
        setActive(false);
        pausedRef.current = true;
        setPaused(true);
        overlayRef.current = false;
        setOverlay(null);
        localStorage.removeItem(examStorageKey(examId));
        localStorage.removeItem(pendingStorageKey(sessionIdRef.current));
        await exitFullscreen();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal mengumpulkan jawaban.",
        );
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [examId, flushPending, flushTextTimers],
  );

  const handleViolation = useCallback(
    async (type: ViolationType, meta?: Record<string, unknown>) => {
      if (!activeRef.current || submittingRef.current || overlayRef.current) {
        return;
      }

      const isStrike = STRIKE_TYPES.has(type);
      const now = Date.now();
      if (now - violationLockRef.current < 1200) return;
      violationLockRef.current = now;

      if (isStrike) {
        overlayRef.current = true;
        pausedRef.current = true;
        setPaused(true);
        setOverlay({
          kind: "violation",
          title: "Pelanggaran terdeteksi",
          message: VIOLATION_MESSAGE[type],
          strikes: strikesRef.current + 1,
        });
      }

      let screenshot: Blob | null = null;
      if (isStrike) {
        captureLockRef.current = true;
        try {
          screenshot = await captureExamScreenshot();
        } finally {
          captureLockRef.current = false;
        }
      }

      const form = new FormData();
      form.append("violationType", type);
      if (meta) form.append("metadata", JSON.stringify(meta));
      if (screenshot) form.append("screenshot", screenshot, "violation.png");

      try {
        const response = await apiForm<ViolationResponse>(
          `/sessions/${sessionIdRef.current}/violations`,
          form,
        );

        strikesRef.current = response.strikeCount;
        setStrikes(response.strikeCount);

        if (response.forceSubmit) {
          submittingRef.current = true;
          activeRef.current = false;
          pausedRef.current = true;
          setActive(false);
          setPaused(true);
          setOverlay({
            kind: "forced",
            title: "Ujian dihentikan",
            message: `Batas ${response.maxStrikes} pelanggaran terlampaui. Jawaban dikumpulkan paksa dan Anda akan keluar dari sesi ini. Hubungi admin/pengawas untuk mereset sesi.`,
            strikes: response.strikeCount,
          });
          await exitFullscreen();
          window.setTimeout(() => {
            clearToken();
            window.location.assign("/login?forced=1");
          }, 4500);
        }
      } catch {
        // Log gagal dikirim; strike tetap terkunci secara lokal.
      }
    },
    [],
  );

  const resumeExam = useCallback(async () => {
    const fullscreen = await enterFullscreen();
    if (!fullscreen) {
      setError("Aktifkan mode layar penuh untuk melanjutkan ujian.");
      return;
    }

    try {
      const response = await api<{
        deadlineAt: string;
        remainingSeconds: number;
      }>(`/sessions/${sessionIdRef.current}/resume`, { method: "POST" });

      setDeadlineAt(response.deadlineAt);
      setRemaining(response.remainingSeconds);
      pausedRef.current = false;
      setPaused(false);
      overlayRef.current = false;
      setOverlay(null);
      void flushTextTimers().then(flushPending);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal melanjutkan ujian.",
      );
    }
  }, [flushPending, flushTextTimers]);

  const handleReconnect = useCallback(async () => {
    await flushTextTimers();
    const flushed = await flushPending();
    if (!flushed) {
      setOnline(false);
      return;
    }

    try {
      const response = await api<SessionPayload>(
        `/sessions/${sessionIdRef.current}`,
      );
      setPayload(response);
      setOnline(true);

      if (response.session.pausedAt) {
        overlayRef.current = true;
        pausedRef.current = true;
        setPaused(true);
        setOverlay({
          kind: "violation",
          title: "Ujian terkunci",
          message:
            "Sesi dijeda. Aktifkan layar penuh untuk melanjutkan ujian.",
          strikes: response.session.strikeCount,
        });
      } else {
        overlayRef.current = false;
        setOverlay(null);
        pausedRef.current = false;
        setPaused(false);
      }
    } catch {
      setOnline(false);
    }
  }, [flushPending, flushTextTimers]);

  const startExam = useCallback(async () => {
    setError(null);
    setStarting(true);

    const fullscreen = await enterFullscreen();
    if (!fullscreen) {
      setError(
        "Mode layar penuh wajib diaktifkan. Izinkan fullscreen lalu coba lagi.",
      );
      setStarting(false);
      return;
    }

    try {
      const response = await api<SessionPayload>("/sessions/start", {
        method: "POST",
        body: JSON.stringify({ examId }),
      });
      setPayload(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memulai ujian.");
      await exitFullscreen();
    } finally {
      setStarting(false);
    }
  }, [examId]);

  // Hydrate state dari payload server + state lokal.
  useEffect(() => {
    if (!payload) return;

    sessionIdRef.current = payload.session.id;
    const map = parseAnswers(payload);

    try {
      const raw = localStorage.getItem(examStorageKey(examId));
      if (raw) {
        const local = JSON.parse(raw) as {
          sessionId?: string;
          answers?: Record<string, AnswerState>;
        };
        if (local.sessionId === payload.session.id && local.answers) {
          for (const question of payload.questions) {
            const hasServerAnswer = payload.answers.some(
              (answer) => answer.questionId === question.id,
            );
            const localAnswer = local.answers[question.id];
            if (localAnswer && !hasServerAnswer) {
              map[question.id] = {
                selectedOptionId: localAnswer.selectedOptionId ?? null,
                answerPayload: localAnswer.answerPayload ?? null,
                isFlagged: Boolean(localAnswer.isFlagged),
              };
              enqueuePending(question.id, map[question.id]);
            }
          }
        }
      }
    } catch {
      // ignore corrupt local state
    }

    setAnswers(map);
    answersRef.current = map;
    setDeadlineAt(payload.session.deadlineAt);
    setRemaining(payload.remainingSeconds);
    strikesRef.current = payload.session.strikeCount;
    setStrikes(payload.session.strikeCount);
    setCurrent(0);

    const running = payload.session.status === "in_progress";
    activeRef.current = running;
    setActive(running);

    if (payload.session.pausedAt) {
      pausedRef.current = true;
      setPaused(true);
      overlayRef.current = true;
      setOverlay({
        kind: "violation",
        title: "Ujian terkunci",
        message:
          "Sesi sebelumnya dijeda. Aktifkan layar penuh untuk melanjutkan ujian.",
        strikes: payload.session.strikeCount,
      });
    } else {
      pausedRef.current = false;
      setPaused(false);
    }
  }, [payload, examId, enqueuePending]);

  // Simpan state jawaban ke localStorage.
  useEffect(() => {
    if (!payload) return;
    try {
      localStorage.setItem(
        examStorageKey(examId),
        JSON.stringify({
          sessionId: payload.session.id,
          answers,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [answers, payload, examId]);

  // Timer lokal yang mengikuti deadline server.
  useEffect(() => {
    if (!active || paused || !deadlineAt) return;

    const deadline = new Date(deadlineAt).getTime();
    const tick = () => {
      const value = Math.max(
        0,
        Math.floor((deadline - Date.now()) / 1000),
      );
      setRemaining(value);
      if (value <= 0) void submitExam(true);
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [active, paused, deadlineAt, submitExam]);

  // Deteksi pindah aplikasi / keluar fullscreen.
  useEffect(() => {
    if (!active) return;

    if (document.fullscreenElement) void lockKeyboard();

    const onVisibility = () => {
      if (document.hidden) void handleViolation("tab_hidden");
    };
    const onBlur = () => {
      void handleViolation("window_blur");
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        unlockKeyboard();
        void handleViolation("fullscreen_exit");
        return;
      }
      // Pasang kembali keyboard lock setelah masuk/resume fullscreen.
      void lockKeyboard();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      unlockKeyboard();
    };
  }, [active, handleViolation]);

  // Blokir interaksi standar.
  useEffect(() => {
    if (!active) return;
    return installInteractionGuards((type, meta) => {
      void handleViolation(type, meta);
    });
  }, [active, handleViolation]);

  // MutationObserver: hanya direct child <body>, whitelist #root & #modal-root.
  useEffect(() => {
    if (!active) return;
    return installMutationGuard(
      (_element, meta) => {
        void handleViolation("dom_injection", meta);
      },
      () => captureLockRef.current,
    );
  }, [active, handleViolation]);

  // Peringatan sebelum menutup halaman.
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  // Status koneksi.
  useEffect(() => {
    const onOffline = () => setOnline(false);
    const onOnline = () => setOnline(true);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!online) {
      pausedRef.current = true;
      setPaused(true);
      if (!overlayRef.current) {
        overlayRef.current = true;
        setOverlay({
          kind: "reconnect",
          title: "Koneksi terputus",
          message:
            "Timer dibekukan. Halaman akan tersinkronisasi ulang setelah koneksi kembali.",
          strikes: strikesRef.current,
        });
      }
    } else if (overlayStateRef.current?.kind === "reconnect") {
      void handleReconnect();
    }
  }, [online, active, handleReconnect]);

  function handleSelectOption(question: SessionQuestion, optionId: string) {
    void saveAnswer(question.id, { selectedOptionId: optionId });
  }

  function handleToggleMulti(question: SessionQuestion, optionId: string) {
    const base = answersRef.current[question.id]?.answerPayload ?? {};
    const ids = Array.isArray(base.option_ids)
      ? ([...base.option_ids] as string[])
      : [];
    const nextIds = ids.includes(optionId)
      ? ids.filter((id) => id !== optionId)
      : [...ids, optionId];
    void saveAnswer(question.id, {
      answerPayload: { ...base, option_ids: nextIds },
    });
  }

  function handleTextChange(question: SessionQuestion, text: string) {
    const base = answersRef.current[question.id]?.answerPayload ?? {};
    const nextPayload = { ...base, text };
    setAnswers((previous) => {
      const currentAnswer = previous[question.id] ?? {
        selectedOptionId: null,
        answerPayload: null,
        isFlagged: false,
      };
      const next = {
        ...previous,
        [question.id]: { ...currentAnswer, answerPayload: nextPayload },
      };
      answersRef.current = next;
      return next;
    });

    pendingTextRef.current[question.id] = nextPayload;

    const existing = textTimersRef.current[question.id];
    if (existing) window.clearTimeout(existing);
    textTimersRef.current[question.id] = window.setTimeout(() => {
      delete textTimersRef.current[question.id];
      const payload = pendingTextRef.current[question.id];
      delete pendingTextRef.current[question.id];
      if (payload) {
        void saveAnswer(question.id, { answerPayload: payload });
      }
    }, 500);
  }

  function handleNumberChange(
    question: SessionQuestion,
    value: number | null,
  ) {
    void saveAnswer(question.id, {
      answerPayload: value === null ? null : { value },
    });
  }

  function handleMatchChange(
    question: SessionQuestion,
    leftId: string,
    rightId: string,
  ) {
    const base = answersRef.current[question.id]?.answerPayload ?? {};
    const mapping = {
      ...((base.mapping as Record<string, string> | undefined) ?? {}),
    };
    if (rightId) mapping[leftId] = rightId;
    else delete mapping[leftId];
    void saveAnswer(question.id, {
      answerPayload: { ...base, mapping },
    });
  }

  function handleToggleFlag(question: SessionQuestion) {
    const flagged = !answersRef.current[question.id]?.isFlagged;
    void saveAnswer(question.id, { isFlagged: flagged });
  }

  const answeredCount = payload
    ? payload.questions.filter((question) =>
        isAnswered(question, answers[question.id]),
      ).length
    : 0;
  const currentQuestion = payload?.questions[current];
  const currentAnswer = currentQuestion
    ? answers[currentQuestion.id]
    : undefined;

  if (result) {
    return (
      <ResultScreen
        result={result}
        examTitle={payload?.exam.title ?? "Ujian"}
        onBack={() => navigate("/", { replace: true })}
      />
    );
  }

  if (!payload) {
    return (
      <PreStartScreen
        exam={examInfo}
        error={error}
        starting={starting}
        onStart={startExam}
        onBack={() => navigate("/")}
      />
    );
  }

  if (!active) {
    return (
      <FinishedScreen
        payload={payload}
        onBack={() => navigate("/", { replace: true })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {payload.exam.title}
            </p>
            <p className="text-xs text-slate-500">
              {answeredCount}/{payload.questions.length} soal terjawab
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`rounded-xl px-3 py-1.5 text-center ${
                remaining <= 300
                  ? "bg-rose-50 text-rose-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                Sisa waktu
              </p>
              <p className="font-mono text-lg font-bold leading-none">
                {formatTime(remaining)}
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 px-3 py-1.5 text-center text-amber-700">
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                Pelanggaran
              </p>
              <p className="text-lg font-bold leading-none">
                {strikes}/{payload.exam.maxStrikes}
              </p>
            </div>

            <span
              className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${
                online
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[220px_1fr]">
        <aside className="card h-fit lg:sticky lg:top-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Navigasi soal
          </p>
          <div className="grid grid-cols-6 gap-2 lg:grid-cols-4">
            {payload.questions.map((question, index) => {
              const answered = isAnswered(question, answers[question.id]);
              const flagged = answers[question.id]?.isFlagged;
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setCurrent(index)}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm font-bold transition ${
                    index === current
                      ? "bg-brand-600 text-white"
                      : flagged
                        ? "bg-amber-100 text-amber-800"
                        : answered
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-1.5 text-xs text-slate-500">
            <p>
              <span className="mr-2 inline-block h-3 w-3 rounded bg-emerald-200 align-middle" />
              Terjawab
            </p>
            <p>
              <span className="mr-2 inline-block h-3 w-3 rounded bg-amber-200 align-middle" />
              Ragu-ragu
            </p>
            <p>
              <span className="mr-2 inline-block h-3 w-3 rounded bg-slate-200 align-middle" />
              Belum dijawab
            </p>
          </div>
        </aside>

        <section className="space-y-4">
          {currentQuestion && currentAnswer && (
            <QuestionCard
              question={currentQuestion}
              answer={currentAnswer}
              number={current + 1}
              onSelectOption={(optionId) =>
                handleSelectOption(currentQuestion, optionId)
              }
              onToggleMulti={(optionId) =>
                handleToggleMulti(currentQuestion, optionId)
              }
              onChangeText={(text) =>
                handleTextChange(currentQuestion, text)
              }
              onChangeNumber={(value) =>
                handleNumberChange(currentQuestion, value)
              }
              onMatchChange={(leftId, rightId) =>
                handleMatchChange(currentQuestion, leftId, rightId)
              }
              onToggleFlag={() => handleToggleFlag(currentQuestion)}
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn-secondary"
              disabled={current === 0}
              onClick={() => setCurrent((value) => Math.max(0, value - 1))}
            >
              Sebelumnya
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={current >= payload.questions.length - 1}
              onClick={() =>
                setCurrent((value) =>
                  Math.min(payload.questions.length - 1, value + 1),
                )
              }
            >
              Berikutnya
            </button>
          </div>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs text-slate-500">
            Auto-save aktif. Jangan berpindah aplikasi atau keluar fullscreen.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            onClick={() => void submitExam(false)}
          >
            {submitting ? "Mengumpulkan..." : "Kumpulkan Jawaban"}
          </button>
        </div>
      </footer>

      {overlay &&
        typeof document !== "undefined" &&
        document.getElementById("modal-root") &&
        createPortal(
          <LockOverlay
            overlay={overlay}
            submitting={submitting}
            onResume={() => void resumeExam()}
            onConfirmSubmit={() => void submitExam(true)}
            onCancel={() => {
              overlayRef.current = false;
              setOverlay(null);
            }}
            onReconnect={() => void handleReconnect()}
          />,
          document.getElementById("modal-root")!,
        )}
    </div>
  );
}

function LockOverlay({
  overlay,
  submitting,
  onResume,
  onConfirmSubmit,
  onCancel,
  onReconnect,
}: {
  overlay: OverlayState;
  submitting: boolean;
  onResume: () => void;
  onConfirmSubmit: () => void;
  onCancel: () => void;
  onReconnect: () => void;
}) {
  const danger = overlay.kind === "forced";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${
            danger ? "bg-rose-100" : "bg-amber-100"
          }`}
        >
          {danger ? "⛔" : overlay.kind === "confirm" ? "📝" : "⚠️"}
        </div>

        <h2 className="text-xl font-bold text-slate-900">{overlay.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{overlay.message}</p>

        {overlay.kind !== "confirm" && (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Pelanggaran tercatat:{" "}
            <span className="font-bold text-slate-900">{overlay.strikes}</span>
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {overlay.kind === "violation" && (
            <button type="button" className="btn-primary" onClick={onResume}>
              Aktifkan Layar Penuh & Lanjutkan
            </button>
          )}

          {overlay.kind === "reconnect" && (
            <button type="button" className="btn-primary" onClick={onReconnect}>
              Sambung Ulang
            </button>
          )}

          {overlay.kind === "confirm" && (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting}
                onClick={onConfirmSubmit}
              >
                {submitting ? "Mengumpulkan..." : "Ya, kumpulkan sekarang"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={onCancel}
              >
                Batal
              </button>
            </>
          )}

          {overlay.kind === "forced" && (
            <p className="text-center text-sm font-semibold text-rose-600">
              Mengalihkan ke halaman login...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PreStartScreen({
  exam,
  error,
  starting,
  onStart,
  onBack,
}: {
  exam: ExamSummary | null;
  error: string | null;
  starting: boolean;
  onStart: () => void;
  onBack: () => void;
}) {
  const finished = exam?.session?.status === "finished";
  const forced =
    finished && exam?.session?.finishedReason === "force_submit";
  const unavailable = !exam;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Persiapan Ujian
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {exam?.title ?? "Ujian"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {exam?.subjectName ?? ""} · {exam?.durationMinutes ?? "-"} menit
        </p>

        <div className="mt-5 space-y-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Aturan selama ujian</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Ujian hanya berjalan dalam mode layar penuh.</li>
            <li>
              Berpindah tab/aplikasi, keluar fullscreen, atau injeksi ekstensi
              dicatat sebagai pelanggaran.
            </li>
            <li>
              Maksimal {exam?.maxStrikes ?? 3} pelanggaran. Melebihi batas =
              jawaban dikumpulkan paksa.
            </li>
            <li>Klik kanan, copy/paste, dan shortcut keyboard diblokir.</li>
            <li>Jawaban tersimpan otomatis setiap kali dipilih.</li>
          </ul>
        </div>

        {finished && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              forced
                ? "bg-rose-50 text-rose-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {forced ? (
              <>
                Sesi Anda dihentikan karena melebihi batas pelanggaran. Hubungi{" "}
                <strong>admin/pengawas</strong> untuk mereset sesi agar Anda
                dapat melanjutkan ujian.
              </>
            ) : (
              <>
                Anda sudah menyelesaikan ujian ini. Nilai:{" "}
                <strong>{exam?.session?.score ?? "-"}</strong>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-secondary" onClick={onBack}>
            Kembali
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={starting || finished || unavailable}
            onClick={onStart}
          >
            {starting
              ? "Menyiapkan..."
              : unavailable
                ? "Tidak Tersedia"
                : finished
                  ? forced
                    ? "Menunggu Reset Admin"
                    : "Sudah Selesai"
                  : "Mulai Ujian (Layar Penuh)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinishedScreen({
  payload,
  onBack,
}: {
  payload: SessionPayload;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">
          {payload.session.status === "finished"
            ? "Ujian Selesai"
            : "Ujian Tidak Aktif"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {payload.session.finishedReason === "force_submit"
            ? "Sesi dihentikan karena melebihi batas pelanggaran. Hubungi admin/pengawas untuk mereset sesi agar Anda dapat melanjutkan ujian."
            : "Sesi ujian ini sudah tidak aktif."}
        </p>
        <button type="button" className="btn-primary mt-6" onClick={onBack}>
          Kembali ke Daftar Ujian
        </button>
      </div>
    </div>
  );
}

function ResultScreen({
  result,
  examTitle,
  onBack,
}: {
  result: ResultState;
  examTitle: string;
  onBack: () => void;
}) {
  const partial = result.gradingStatus !== "completed";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          Jawaban Terkumpul
        </h1>
        <p className="mt-1 text-sm text-slate-500">{examTitle}</p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Nilai
          </p>
          <p className="text-4xl font-black text-slate-900">{result.score}</p>
        </div>

        {partial && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Sebagian soal (essay) menunggu penilaian manual.
          </p>
        )}

        <button type="button" className="btn-primary mt-6 w-full" onClick={onBack}>
          Kembali ke Daftar Ujian
        </button>
      </div>
    </div>
  );
}
