import type { AnswerState, SessionPayload, SessionQuestion } from "./types";

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function parseAnswers(
  payload: SessionPayload,
): Record<string, AnswerState> {
  const map: Record<string, AnswerState> = {};
  for (const question of payload.questions) {
    map[question.id] = {
      selectedOptionId: null,
      answerPayload: null,
      isFlagged: false,
    };
  }
  for (const answer of payload.answers) {
    map[answer.questionId] = {
      selectedOptionId: answer.selectedOptionId,
      answerPayload: answer.answerPayload,
      isFlagged: answer.isFlagged,
    };
  }
  return map;
}

export function isAnswered(
  question: SessionQuestion,
  answer?: AnswerState,
): boolean {
  if (!answer) return false;

  if (
    question.questionType === "multiple_choice" ||
    question.questionType === "true_false"
  ) {
    return Boolean(answer.selectedOptionId);
  }

  const payload = answer.answerPayload ?? {};

  if (question.questionType === "multiple_response") {
    return (
      Array.isArray(payload.option_ids) && payload.option_ids.length > 0
    );
  }

  if (question.questionType === "matching") {
    return (
      typeof payload.mapping === "object" &&
      payload.mapping !== null &&
      Object.keys(payload.mapping as Record<string, string>).length > 0
    );
  }

  if (question.questionType === "numerical") {
    return typeof payload.value === "number";
  }

  return typeof payload.text === "string" && payload.text.trim().length > 0;
}
