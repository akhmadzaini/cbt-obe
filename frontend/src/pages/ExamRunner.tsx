import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ExamWorkspace from "../components/exam/ExamWorkspace";
import PreStartScreen from "../components/exam/PreStartScreen";
import FinishedScreen from "../components/exam/FinishedScreen";
import ResultScreen from "../components/exam/ResultScreen";
import type { OverlayState, ResultState } from "../components/exam/types";
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
import { isAnswered, parseAnswers } from "../lib/exam-utils";
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
    <ExamWorkspace
      payload={payload}
      answeredCount={answeredCount}
      remaining={remaining}
      strikes={strikes}
      online={online}
      current={current}
      setCurrent={setCurrent}
      answers={answers}
      submitting={submitting}
      submitExam={submitExam}
      overlay={overlay}
      overlayRef={overlayRef}
      setOverlay={setOverlay}
      resumeExam={resumeExam}
      handleReconnect={handleReconnect}
      handleSelectOption={handleSelectOption}
      handleToggleMulti={handleToggleMulti}
      handleTextChange={handleTextChange}
      handleNumberChange={handleNumberChange}
      handleMatchChange={handleMatchChange}
      handleToggleFlag={handleToggleFlag}
    />
  );
}
