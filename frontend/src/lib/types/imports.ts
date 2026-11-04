export type ImportResult = {
  importId: string;
  format: string;
  total: number;
  imported: number;
  errors: { index: number; message: string; raw: string }[];
};

export type ImportRow = {
  id: string;
  subjectId: string;
  format: string;
  originalFilename: string | null;
  status: string;
  totalQuestions: number;
  importedQuestions: number;
  createdAt: string;
};
