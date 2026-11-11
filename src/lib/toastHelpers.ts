/**
 * Utilitários de feedback visual (Toasts).
 * Centraliza a exibição de mensagens para manter consistência em toda a aplicação.
 */
import { toast } from '@/hooks/use-toast';

/**
 * Mapeia erros crus do Postgres/PostgREST/Supabase para mensagens
 * amigáveis em PT-BR, evitando vazamento de estrutura interna do banco
 * (nomes de tabelas, colunas, policies, codes do PostgREST).
 */
function sanitizeErrorMessage(raw: string, fallback: string): string {
  if (!raw) return fallback;
  const msg = raw.trim();

  // Padrões internos que não devem ser expostos ao usuário final
  const leakyPatterns = [
    /relation .* does not exist/i,
    /column .* does not exist/i,
    /violates .* constraint/i,
    /violates row-level security/i,
    /permission denied for /i,
    /pgrst\d+/i,
    /jwt/i,
    /duplicate key value/i,
    /foreign key/i,
    /policy /i,
    /^new row violates/i,
    /search_path/i,
    /function .* does not exist/i,
    // QA-UX (rodada 10): mensagens de infraestrutura/roteamento tambem nao
    // devem chegar ao usuario. Observado quando um DELETE falhou no
    // ambiente isolado: "metodo/rota nao suportados: DELETE /rest/v1/...".
    /metodo\/rota nao suportados/i,
    /rota nao suportada/i,
    /method not allowed/i,
    /\b(GET|POST|PATCH|DELETE|PUT)\s+\/rest\/v1\//i,
  ];

  if (leakyPatterns.some((re) => re.test(msg))) {
    return fallback;
  }

  // Mensagens muito longas (>200 chars) provavelmente são stack/SQL — trunca
  if (msg.length > 200) return fallback;

  return msg;
}

/**
 * Toast de erro genérico. Aceita Error, string ou objeto com `message`.
 *
 * QA-UX (rodada 9): o fallback anterior, "Ocorreu um erro inesperado",
 * nao dizia ao usuario O QUE FAZER e ainda escondia um defeito real — o
 * INSERT de cliente falhava por `CHECK (document_type IN ('CPF','CNPJ'))`
 * e o usuario recebia apenas essa frase. O fallback agora e acionavel:
 * orienta a revisar os dados e tentar de novo, sem vazar detalhes de SQL.
 */
export function toastError(
  error: unknown,
  fallback = 'Não foi possível concluir a operação. Verifique os dados e tente novamente.',
  title = 'Erro',
) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : (error as { message?: string })?.message ?? '';
  const description = sanitizeErrorMessage(raw, fallback);
  toast({ title, description, variant: 'destructive' });
}

/** Toast de sucesso simples. */
export function toastSuccess(title: string, description?: string) {
  toast({ title, description });
}

/** Helper para onError de mutations React Query. */
export const handleMutationError = (e: unknown) => toastError(e);

/** Factory que cria handler onError com título customizado. */
export const mutationErrorHandler = (title: string) => (e: unknown) => toastError(e, undefined, title);
