import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import { ClaudeProviderAuth } from '@/modules/providers/list/claude/claude-auth.provider.js';
import { ClaudeProviderModels } from '@/modules/providers/list/claude/claude-models.provider.js';
import { ClaudeMcpProvider } from '@/modules/providers/list/claude/claude-mcp.provider.js';
import { ClaudeSessionSynchronizer } from '@/modules/providers/list/claude/claude-session-synchronizer.provider.js';
import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import { ClaudeSkillsProvider } from '@/modules/providers/list/claude/claude-skills.provider.js';
import type {
  IProviderAuth,
  IProviderModels,
  IProviderSessionSynchronizer,
  IProviderSkills,
  IProviderSessions,
} from '@/shared/interfaces.js';

export class ClaudeProvider extends AbstractProvider {
  readonly models: IProviderModels = new ClaudeProviderModels();
  readonly mcp: ClaudeMcpProvider;
  readonly auth: IProviderAuth;
  readonly skills: IProviderSkills;
  readonly sessions: IProviderSessions = new ClaudeSessionsProvider();
  readonly sessionSynchronizer: IProviderSessionSynchronizer;

  constructor(id: string = 'claude', configDir?: string) {
    super('claude', id);
    this.mcp = new ClaudeMcpProvider(configDir);
    this.auth = new ClaudeProviderAuth(configDir);
    this.skills = new ClaudeSkillsProvider(configDir);
    this.sessionSynchronizer = new ClaudeSessionSynchronizer(id, configDir);
  }
}
