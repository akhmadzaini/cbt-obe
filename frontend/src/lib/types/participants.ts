import type { Role } from "./common";

export type Participant = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

/** Data peserta ringkas untuk pemilih peserta (picker). */
export type ParticipantSummary = Pick<
  Participant,
  "id" | "username" | "fullName" | "isActive"
> & {
  sessionCount?: number;
};

export type ParticipantInput = {
  username: string;
  fullName: string;
  password?: string;
  isActive: boolean;
};

export type ParticipantUsage = {
  userId: string;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  lastSessionAt: string | null;
  canDelete: boolean;
  reasons: string[];
};

export type UserImportError = {
  row: number;
  username: string;
  message: string;
};

export type UserImportResult = {
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: UserImportError[];
};
