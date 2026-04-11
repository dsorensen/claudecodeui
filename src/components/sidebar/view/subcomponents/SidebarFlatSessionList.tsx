import { LayoutList, MessageSquare, Search } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { LoadingProgress, Project, ProjectSession, SessionProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import SidebarFlatSessionItem from './SidebarFlatSessionItem';

export type SidebarFlatSessionListProps = {
  projects: Project[];
  projectsByName: Map<string, Project>;
  filteredFlatSessions: SessionWithProvider[];
  flatSessionsTotal: number;
  selectedSession: ProjectSession | null;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  searchFilter: string;
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
  onSwitchToGroupedView: () => void;
  t: TFunction;
};

export default function SidebarFlatSessionList({
  projects,
  projectsByName,
  filteredFlatSessions,
  flatSessionsTotal,
  selectedSession,
  isLoading,
  loadingProgress,
  currentTime,
  editingSession,
  editingSessionName,
  searchFilter,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onSwitchToGroupedView,
  t,
}: SidebarFlatSessionListProps) {
  if (isLoading) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">{t('projects.loadingProjects')}</h3>
        {loadingProgress && loadingProgress.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {loadingProgress.current}/{loadingProgress.total} {t('projects.projects')}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('projects.fetchingProjects')}</p>
        )}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">{t('sessions.noSessions')}</h3>
        <p className="text-sm text-muted-foreground">{t('sessions.noSessionsDescription')}</p>
      </div>
    );
  }

  if (flatSessionsTotal === 0) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">{t('sessions.noSessions')}</h3>
        <p className="text-sm text-muted-foreground">{t('sessions.noSessionsDescription')}</p>
      </div>
    );
  }

  if (filteredFlatSessions.length === 0 && searchFilter.trim().length > 0) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <Search className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">
          {t('sessions.noMatchingSessions')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('projects.tryDifferentSearch')}</p>
      </div>
    );
  }

  return (
    <div className="pb-safe-area-inset-bottom md:space-y-1">
      {filteredFlatSessions.map((session) => (
        <SidebarFlatSessionItem
          key={`${session.__projectName}-${session.id}`}
          session={session}
          projectsByName={projectsByName}
          selectedSession={selectedSession}
          currentTime={currentTime}
          editingSession={editingSession}
          editingSessionName={editingSessionName}
          onEditingSessionNameChange={onEditingSessionNameChange}
          onStartEditingSession={onStartEditingSession}
          onCancelEditingSession={onCancelEditingSession}
          onSaveEditingSession={onSaveEditingSession}
          onProjectSelect={onProjectSelect}
          onSessionSelect={onSessionSelect}
          onDeleteSession={onDeleteSession}
          t={t}
        />
      ))}

      <div className="mt-3 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
        <div className="flex items-start gap-1.5">
          <LayoutList className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>
            {t('sessions.flatViewNote')}{' '}
            <button
              type="button"
              className="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
              onClick={onSwitchToGroupedView}
            >
              {t('sessions.switchToGrouped')}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
