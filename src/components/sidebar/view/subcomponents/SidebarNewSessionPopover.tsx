import { useEffect, useMemo, useRef, useState } from 'react';
import { Folder, Search, Star } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Input } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import type { Project } from '../../../../types/app';

type SidebarNewSessionPopoverProps = {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onClose: () => void;
  t: TFunction;
};

export default function SidebarNewSessionPopover({
  projects,
  onSelectProject,
  onClose,
  t,
}: SidebarNewSessionPopoverProps) {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const aStarred = a.isStarred ? 1 : 0;
      const bStarred = b.isStarred ? 1 : 0;
      if (aStarred !== bStarred) return bStarred - aStarred;
      return (a.displayName || a.projectId).localeCompare(b.displayName || b.projectId);
    });
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedProjects;
    return sortedProjects.filter(
      (project) =>
        (project.displayName || project.projectId).toLowerCase().includes(q) ||
        project.projectId.toLowerCase().includes(q),
    );
  }, [sortedProjects, query]);

  const sessionCount = (project: Project) =>
    (project.sessions?.length || 0) +
    (project.cursorSessions?.length || 0) +
    (project.codexSessions?.length || 0) +
    (project.geminiSessions?.length || 0) +
    (project.opencodeSessions?.length || 0);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t('newSession.pickProject')}
      className="absolute right-0 top-9 z-50 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border/80 bg-card shadow-xl ring-1 ring-black/5 dark:ring-white/10"
    >
      <div className="border-b border-border/70 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            autoFocus
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('newSession.searchPlaceholder')}
            className="h-8 rounded-md border-0 bg-muted/40 pl-8 text-xs placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        {filteredProjects.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t('newSession.noMatches')}
          </div>
        ) : (
          filteredProjects.map((project) => {
            const isStarred = Boolean(project.isStarred);
            const count = sessionCount(project);
            return (
              <button
                key={project.projectId}
                type="button"
                onClick={() => {
                  onSelectProject(project);
                  onClose();
                }}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                  'hover:bg-accent/60 focus:bg-accent/60 focus:outline-none',
                )}
              >
                <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground group-hover:text-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {project.displayName || project.projectId}
                </span>
                {isStarred && (
                  <Star className="h-3 w-3 flex-shrink-0 fill-yellow-400 text-yellow-400" />
                )}
                {count > 0 && (
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground/70">
                    {count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
