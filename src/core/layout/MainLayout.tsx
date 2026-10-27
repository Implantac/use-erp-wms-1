import { Suspense, useEffect, useRef } from 'react';
import { ScreenTimingCard, useRouteTimingRecorder } from '@/modules/wms/components/ScreenTimingCard';
import { withRenderMonitor } from '@/core/debug/RenderDepthMonitor';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';
import { useAuth } from '@/hooks/system/useAuth';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { Breadcrumbs } from '@/shared/components/Breadcrumbs';
import { BrainDrawer, BRAIN_OPEN_EVENT } from '@/components/ai/BrainDrawer';
import { DrillDownDrawer } from '@/shared/components/DrillDownDrawer';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { OperationalScopeGuard } from '@/components/auth/OperationalScopeGuard';

export const MainLayout = () => {
  const { isAuthenticated, sidebarCollapsed, theme, user } = useAppStore();
  const { loading, hasSession } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  useRouteTimingRecorder();

  const isBypassPage = ['/upgrade', '/subscribe'].includes(pathname);

  // Redirect to login only when there is truly no session. While Supabase has a
  // session but the tenant context is still hydrating we keep showing the loader,
  // otherwise deep links bounce login -> dashboard and the user loses the page.
  useEffect(() => {
    if (!loading && !hasSession && !isAuthenticated && !isBypassPage) {
      if (pathname !== '/login') {
        const next = encodeURIComponent(`${pathname}${search || ''}`);
        requestAnimationFrame(() => {
          const state = useAppStore.getState();
          if (!state.isAuthenticated) {
            navigate(`/login?next=${next}`, { replace: true });
          }
        });
      }
    }
  }, [isAuthenticated, hasSession, loading, navigate, isBypassPage, pathname, search]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Global shortcut: Ctrl/Cmd + J opens the contextual Brain drawer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(BRAIN_OPEN_EVENT));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (loading || (hasSession && !isAuthenticated && !isBypassPage)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="absolute inset-0 h-8 w-8 animate-ping rounded-full bg-primary/20" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isBypassPage) {
    return null;
  }


  return (
    <div className="h-dvh overflow-hidden bg-background">
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <CommandPalette />
      <BrainDrawer />
      <DrillDownDrawer />
      <Sidebar />
      <Topbar />
      <main
        id="main-content"
        tabIndex={-1}

        className={cn(
          'h-dvh overflow-y-auto overflow-x-hidden pt-14 transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] scrollbar-thin',
          'pl-0',
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'
        )}
      >
        <div className="mx-auto w-full min-w-0 max-w-[1600px] px-3 py-3 sm:px-6 sm:py-6 lg:px-8">

          <Breadcrumbs />
          <Suspense
            fallback={
              <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          >
            <OperationalScopeGuard>
              <Outlet />
            </OperationalScopeGuard>
          </Suspense>
        </div>


      </main>
    </div>
  );
};
