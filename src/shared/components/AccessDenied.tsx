import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/ui/base/button';
import { Card, CardContent } from '@/ui/base/card';

/**
 * QA-UX (2a rodada) — fim do "acesso negado silencioso".
 *
 * `AccessGuard` usa `fallback = null` por padrão: quem passa no
 * `OperationalScopeGuard` do MainLayout mas não tem a role exigida recebia uma
 * área em branco, sem explicação. Este componente dá a mensagem e uma saída.
 *
 * Nota de diagnóstico (QA-UX): o breadcrumb vazio observado em /admin/usuarios
 * com a identidade ADMIN no ambiente isolado NÃO é este guard — é a página
 * Users aguardando uma Edge Function que o harness isolado não implementa
 * (404 /functions/v1/*). Limitação do ambiente, não defeito do produto.
 */
export function AccessDenied({ moduleName }: { moduleName?: string }) {
  const navigate = useNavigate();
  return (
    <Card className="mx-auto max-w-lg border-border/60">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-foreground">
          Sem permissão para {moduleName ? `acessar ${moduleName}` : 'acessar esta área'}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Seu perfil não tem acesso a este módulo. Se você precisa dele para trabalhar,
          peça ao administrador da empresa que libere a permissão correspondente.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
          <Button onClick={() => navigate('/dashboard')}>Ir para o início</Button>
        </div>
      </CardContent>
    </Card>
  );
}
