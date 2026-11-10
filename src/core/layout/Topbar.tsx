import { Command, Menu, Moon, Search, Sparkles, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';
import { Button } from '@/ui/base/button';
import { cn } from '@/lib/utils';
import { TenantSelector } from './topbar/TenantSelector';
import { NotificationsMenu } from './topbar/NotificationsMenu';
import { BrainButton } from './topbar/BrainButton';
import { UserMenu } from './topbar/UserMenu';

export function Topbar() {
  const navigate = useNavigate();
  const { sidebarCollapsed, theme, toggleSidebar, toggleSidebarMobile, toggleTheme } = useAppStore();

  return (
    <header
      className={cn(
        'fixed right-0 top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-2 shadow-sm sm:px-4 transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none supports-[backdrop-filter]:bg-sidebar/95 supports-[backdrop-filter]:backdrop-blur-xl',
        'left-0',
        sidebarCollapsed ? 'md:left-16' : 'md:left-64'
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />

       <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) toggleSidebarMobile();
            else toggleSidebar();
          }}
          aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          aria-controls="app-sidebar"
          aria-expanded={!sidebarCollapsed}
           className="h-9 w-9 shrink-0 rounded-md text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>

        <div className="mx-1 hidden sm:block h-6 w-px bg-sidebar-border/60" aria-hidden="true" />

        <TenantSelector />
      </div>

       <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {/* QA-UX (rodada 5): em 768px a barra de busca (~180px) fazia o lado
            direito do header somar 543px num espaco de 512px, cortando o menu
            do usuario. Ctrl+K / CommandPalette continuam disponiveis. */}
        <Button
          variant="ghost"
          size="sm"
           onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
           className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-md border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent hover:border-sidebar-primary/50 text-xs transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Buscar…</span>
           <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/70">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </Button>

         <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            className="hidden sm:inline-flex h-9 w-9 rounded-md text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          {theme === 'light' ? <Moon className="h-[18px] w-[18px]" aria-hidden="true" /> : <Sun className="h-[18px] w-[18px]" aria-hidden="true" />}
        </Button>

        <NotificationsMenu />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/executive/executive')}
          title="IA Executiva"
          aria-label="Abrir IA Executiva"
           className="hidden sm:inline-flex h-9 w-9 rounded-md text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>

        <BrainButton />

        <div className="mx-2 hidden sm:block h-6 w-px bg-sidebar-border/60" aria-hidden="true" />

        <UserMenu />
      </div>
    </header>
  );
}
