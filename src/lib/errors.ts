/**
 * Extrai uma mensagem legível de qualquer erro (unknown) sem usar `any`.
 */
export function errorMessage(error: unknown, fallback = "Erro inesperado"): string {
  if (typeof error === "string") return error || fallback;
  if (error instanceof Error) return error.message || fallback;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; error_description?: unknown; details?: unknown };
    const candidate = maybe.message ?? maybe.error_description ?? maybe.details;
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return fallback;
}

/**
 * Converte falhas de autenticação em mensagens acionáveis em PT-BR.
 *
 * `errorMessage()` devolve a mensagem crua do provedor; em erro de rede isso
 * vaza "Failed to fetch" para o usuário final, que não sabe o que fazer com
 * isso. Aqui traduzimos por classe de falha e, em último caso, devolvemos um
 * fallback genérico — nunca detalhes técnicos (SQL, RLS, JWT, stack, chaves).
 */
export function friendlyAuthError(
  error: unknown,
  fallback = "Não foi possível entrar. Verifique os dados e tente novamente.",
): string {
  const raw = errorMessage(error, "").toLowerCase();
  if (!raw) return fallback;

  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed|err_(failed|network|connection)|timeout|timed out|econnrefused/.test(raw)) {
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  }
  if (/invalid login credentials|invalid credentials|wrong password|email or password|user not found|invalid_grant/.test(raw)) {
    return "Email ou senha incorretos. Confira os dados e tente novamente.";
  }
  if (/email not confirmed|email_not_confirmed|confirm your email|confirm your email address/.test(raw)) {
    return "Seu email ainda não foi confirmado. Verifique sua caixa de entrada.";
  }
  if (/too many requests|rate limit|429|for security purposes/.test(raw)) {
    return "Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.";
  }
  if (/password.*(short|minimum|weak)|senha.*mínimo/.test(raw)) {
    return "A senha não atende aos requisitos mínimos de segurança.";
  }

  // Qualquer outra coisa é interna: não expor ao usuário.
  return fallback;
}
