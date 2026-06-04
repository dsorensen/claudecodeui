export type LLMProvider = 'claude' | 'cursor' | 'codex' | 'gemini' | 'opencode';

/**
 * A provider *instance* id. Base providers are bare names; Claude can have
 * additional profiles addressed as `claude:<name>`. Resolve type-level concerns
 * (icon, model catalog) via baseProviderOf() in src/lib/provider-id.ts.
 */
export type ProviderInstanceId = LLMProvider | `claude:${string}`;

/** Frontend-facing Claude profile summary (mirror of the /profiles endpoint). */
export type ClaudeProfileSummary = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type ProviderModelOption = {
  value: string;
  label: string;
  description?: string;
};

export type ProviderModelsDefinition = {
  OPTIONS: ProviderModelOption[];
  DEFAULT: string;
};

export type ProviderModelsCacheInfo = {
  updatedAt: string;
  expiresAt: string;
  source: 'memory' | 'disk' | 'fresh';
};

export type AppTab = 'chat' | 'files' | 'shell' | 'git' | 'tasks' | 'preview' | `plugin:${string}`;

export interface ProjectSession {
  id: string;
  title?: string;
  summary?: string;
  name?: string;
  createdAt?: string;
  created_at?: string;
  updated_at?: string;
  lastActivity?: string;
  messageCount?: number;
  __provider?: ProviderInstanceId;
  // Full provider instance id from the backend session row (e.g. "claude:work").
  // Present on summaries returned by the project/session list APIs.
  providerInstanceId?: string;
  // Tags the session with the owning project's DB `projectId` so UI handlers
  // (session switching, sidebar focus, etc.) can match against selectedProject.
  __projectId?: string;
  [key: string]: unknown;
}

export interface ProjectSessionMeta {
  total?: number;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface ProjectTaskmasterInfo {
  hasTaskmaster?: boolean;
  status?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// After the projectName → projectId migration the backend no longer returns a
// folder-derived `name` string. Projects are now addressed everywhere by the
// DB-assigned `projectId` (primary key in the `projects` table), and the UI
// uses the same identifier for routing, state keys and API calls.
export interface Project {
  projectId: string;
  displayName: string;
  fullPath: string;
  path?: string;
  isStarred?: boolean;
  sessions?: ProjectSession[];
  cursorSessions?: ProjectSession[];
  codexSessions?: ProjectSession[];
  geminiSessions?: ProjectSession[];
  opencodeSessions?: ProjectSession[];
  sessionMeta?: ProjectSessionMeta;
  taskmaster?: ProjectTaskmasterInfo;
  [key: string]: unknown;
}

export interface LoadingProgress {
  type?: 'loading_progress';
  phase?: string;
  current: number;
  total: number;
  currentProject?: string;
  [key: string]: unknown;
}

export interface ProjectsUpdatedMessage {
  type: 'projects_updated';
  projects: Project[];
  updatedSessionId?: string;
  updatedSessionIds?: string[];
  watchProvider?: LLMProvider;
  watchProviders?: LLMProvider[];
  changeType?: 'add' | 'change';
  changeTypes?: Array<'add' | 'change'>;
  batched?: boolean;
  [key: string]: unknown;
}

export interface LoadingProgressMessage extends LoadingProgress {
  type: 'loading_progress';
}

export type AppSocketMessage =
  | LoadingProgressMessage
  | ProjectsUpdatedMessage
  | { type?: string;[key: string]: unknown };
