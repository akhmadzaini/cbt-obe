export type OverlayState =
  | { kind: "violation"; title: string; message: string; strikes: number }
  | { kind: "forced"; title: string; message: string; strikes: number }
  | { kind: "confirm"; title: string; message: string; strikes: number }
  | { kind: "reconnect"; title: string; message: string; strikes: number };

export type ResultState = {
  score: number;
  gradingStatus: string;
  finishedReason: string;
};
