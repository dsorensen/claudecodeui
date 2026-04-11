import { Check, Edit2, Folder, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Badge, Button } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import { formatTimeAgo } from '../../../../utils/dateUtils';
import type { Project, ProjectSession, SessionProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import { createSessionViewModel } from '../../utils/utils';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

type SidebarFlatSessionItemProps = {
  session: SessionWithProvider;
  projectsByName: Map<string, Project>;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: SessionProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: SessionProvider,
  ) => void;
  t: TFunction;
};

export default function SidebarFlatSessionItem({
  session,
  projectsByName,
  selectedSession,
  currentTime,
  editingSession,
  editingSessionName,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  t,
}: SidebarFlatSessionItemProps) {
  const sessionView = createSessionViewModel(session, currentTime, t);
  const isSelected = selectedSession?.id === session.id;
  const projectName = session.__projectName || '';
  const project = projectsByName.get(projectName);
  const projectDisplay = project?.displayName || projectName;

  const selectSession = () => {
    if (project) {
      onProjectSelect(project);
    }
    onSessionSelect(session, projectName);
  };

  const saveEditedSession = () => {
    onSaveEditingSession(projectName, session.id, editingSessionName, session.__provider);
  };

  const requestDeleteSession = () => {
    onDeleteSession(projectName, session.id, sessionView.sessionName, session.__provider);
  };

  return (
    <div className="group relative">
      {sessionView.isActive && !isSelected && (
        <div
          className="pointer-events-none absolute left-1 top-1/2 z-10 h-2 w-2 -translate-y-1/2 animate-pulse rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]"
        />
      )}

      <div className="md:hidden">
        <div
          className={cn(
            'p-2 mx-3 my-0.5 rounded-md bg-card border active:scale-[0.98] transition-all duration-150 relative',
            isSelected ? 'bg-primary/5 border-primary/20' : '',
            !isSelected && sessionView.isActive
              ? 'border-green-500/30 bg-green-50/5 dark:bg-green-900/5'
              : 'border-border/30',
          )}
          onClick={selectSession}
        >
          <div className="flex items-start gap-2">
            <div
              className={cn(
                'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5',
                isSelected ? 'bg-primary/10' : 'bg-muted/50',
              )}
            >
              <SessionProviderLogo provider={session.__provider} className="h-3 w-3" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">{sessionView.sessionName}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Folder className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/70" />
                  <span className="truncate text-[11px] text-muted-foreground/80">{projectDisplay}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(sessionView.sessionTime, currentTime, t)}
                  </span>
                  {sessionView.messageCount > 0 && (
                    <Badge variant="secondary" className="px-1 py-0 text-xs">
                      {sessionView.messageCount}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {!sessionView.isCursorSession && (
              <button
                className="ml-1 flex h-5 w-5 items-center justify-center rounded-md bg-red-50 opacity-70 transition-transform active:scale-95 dark:bg-red-900/20"
                onClick={(event) => {
                  event.stopPropagation();
                  requestDeleteSession();
                }}
              >
                <Trash2 className="h-2.5 w-2.5 text-red-600 dark:text-red-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start p-2 h-auto font-normal text-left hover:bg-accent/50 transition-colors duration-200',
            isSelected && 'bg-accent text-accent-foreground',
          )}
          onClick={selectSession}
        >
          <div className="flex w-full min-w-0 items-start gap-2">
            <SessionProviderLogo provider={session.__provider} className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">{sessionView.sessionName}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Folder className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/70" />
                  <span className="truncate text-[11px] text-muted-foreground/80">{projectDisplay}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1 transition-opacity group-hover:opacity-0">
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(sessionView.sessionTime, currentTime, t)}
                  </span>
                  {sessionView.messageCount > 0 && (
                    <Badge variant="secondary" className="px-1 py-0 text-xs">
                      {sessionView.messageCount}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Button>

        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 transform items-center gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
          {editingSession === session.id ? (
            <>
              <input
                type="text"
                value={editingSessionName}
                onChange={(event) => onEditingSessionNameChange(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    saveEditedSession();
                  } else if (event.key === 'Escape') {
                    onCancelEditingSession();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                className="w-32 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <button
                className="flex h-6 w-6 items-center justify-center rounded bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40"
                onClick={(event) => {
                  event.stopPropagation();
                  saveEditedSession();
                }}
                title={t('tooltips.save')}
              >
                <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              </button>
              <button
                className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelEditingSession();
                }}
                title={t('tooltips.cancel')}
              >
                <X className="h-3 w-3 text-gray-600 dark:text-gray-400" />
              </button>
            </>
          ) : (
            <>
              <button
                className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartEditingSession(session.id, sessionView.sessionName);
                }}
                title={t('tooltips.editSessionName')}
              >
                <Edit2 className="h-3 w-3 text-gray-600 dark:text-gray-400" />
              </button>
              {!sessionView.isCursorSession && (
                <button
                  className="flex h-6 w-6 items-center justify-center rounded bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40"
                  onClick={(event) => {
                    event.stopPropagation();
                    requestDeleteSession();
                  }}
                  title={t('tooltips.deleteSession')}
                >
                  <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
