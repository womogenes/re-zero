export interface Finding {
  id?: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  location?: string;
  recommendation?: string;
  codeSnippet?: string;
}

export interface LaunchResponse {
  scan_id: string;
  project_id: string;
}

export interface PollResponse {
  status: "queued" | "running" | "completed" | "failed";
  error?: string;
  actions: Action[];
  report?: Report;
}

export interface Action {
  _id: string;
  scanId: string;
  type: "tool_call" | "tool_result" | "reasoning" | "observation" | "report" | "human_input_request";
  payload: unknown;
  timestamp: number;
}

export interface Report {
  scanId: string;
  projectId: string;
  findings: Finding[];
  summary?: string;
  createdAt: number;
}

export interface RemConfig {
  apiKey?: string;
  serverUrl?: string;
}
