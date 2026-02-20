// Shared types for scan actions, turns, and findings

export type ActionPayload = string | Record<string, unknown>;

export type Action = {
  _id: string;
  type: string;
  payload: ActionPayload;
  timestamp: number;
};

export type Turn = {
  index: number;
  reasoning: string;
  actions: Action[];
  timestamp: number;
};

export type Finding = {
  id?: string;
  title: string;
  severity: string;
  description: string;
  location?: string;
  recommendation?: string;
  codeSnippet?: string;
};

export type Report = {
  summary?: string;
  findings: Finding[];
  createdAt: number;
};

export type ScanStats = {
  filesRead: number;
  searches: number;
  turns: number;
  screenshots: number;
  browserActions: number;
  duration: string;
};
