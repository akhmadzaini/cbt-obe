export type BackupScope = "full" | "database" | "uploads";

export type SystemStatus = {
  backupEnabled: boolean;
  maintenance: boolean;
  maintenanceMessage: string | null;
  activeJobId: string | null;
  databaseBytes: number;
  uploadsBytes: number;
  uploadsFiles: number;
  backupCount: number;
  backupBytes: number;
  diskFreeBytes: number | null;
  activeSessions: number;
  backupRetentionCount: number;
  maxUploadMb: number;
};

export type BackupRow = {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  type: string;
  includeUploads: boolean;
  tables: Record<string, number>;
};

export type SystemJob = {
  id: string;
  type: "backup" | "restore" | "reset";
  status: "running" | "done" | "failed";
  step: string;
  progress: number;
  error: string | null;
  result: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
};

export type SystemEventRow = {
  id: string;
  actorId: string | null;
  actorUsername: string;
  action: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};
