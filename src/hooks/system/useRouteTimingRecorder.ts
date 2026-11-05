import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { markNavigationStart, markRouteRendered } from '@/lib/screenTiming';

/** Registra o tempo de cada troca de rota nesta sessão. */
export function useRouteTimingRecorder() {
  const location = useLocation();
  useEffect(() => {
    markNavigationStart();
    const raf = requestAnimationFrame(() => {
      const t = setTimeout(() => markRouteRendered(location.pathname), 0);
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);
}
