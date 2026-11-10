import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail, ArrowLeft, UserPlus } from 'lucide-react';
import logoUseSistemas from '@/assets/logo.png';
import { useAuth } from '@/hooks/system/useAuth';
import { useAppStore } from '@/stores/useAppStore';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { cn } from '@/lib/utils';
import { toastSuccess } from '@/lib/toastHelpers';
import { friendlyAuthError } from '@/lib/errors';

/**
 * QA-UX (10/11/2026) — revisão clínica da porta de entrada do ERP.
 *
 * Antes (medido com Chromium real, ver docs/AVALIACAO-UX-2026-11-10.md):
 *  - `opacity: 0` inline deixava título/card/logo INVISÍVEIS se a animação
 *    CSS não rodasse (reduced motion, CSS bloqueado, extensão, falha de carga);
 *  - nenhum `autoComplete`: gestores de senha não preenchiam as credenciais;
 *  - sem `required`/`aria-invalid`: leitores de tela não sabiam o que faltava;
 *  - submit vazio focava no BOTÃO e mostrava apenas um toast genérico
 *    "Preencha todos os campos", sem dizer QUAL campo corrigir;
 *  - erro de rede vazava "Failed to fetch" em inglês para o usuário;
 *  - `isLoading` fora de `finally`: uma exceção no catch travava o botão.
 *
 * Agora: conteúdo visível por padrão (animação é realce opcional no CSS),
 * validação por campo com foco automático, mensagens acionáveis em PT-BR e
 * estados de carregamento sempre liberados.
 */
type View = 'login' | 'signup' | 'forgot';
type FieldErrors = { name?: string; email?: string; password?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get('next');
  const nextTarget = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
  const { isAuthenticated } = useAppStore();
  const { signIn, signUp, resetPassword } = useAuth();

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) navigate(nextTarget);
  }, [isAuthenticated, navigate, nextTarget]);

  // Ao trocar de tela, limpa erros da tela anterior para não empilhar avisos.
  useEffect(() => {
    setFieldErrors({});
    setFormError('');
  }, [view]);

  /** Valida, marca aria-invalid e leva o foco ao PRIMEIRO campo com problema. */
  const validate = (
    fields: { name?: boolean; email?: boolean; password?: boolean },
    passwordMin = 0,
  ): boolean => {
    const errors: FieldErrors = {};
    if (fields.name && !name.trim()) errors.name = 'Informe seu nome completo.';
    if (fields.email) {
      if (!email.trim()) errors.email = 'Informe seu email.';
      else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Informe um email válido, como nome@empresa.com.';
    }
    if (fields.password) {
      if (!password) errors.password = 'Informe sua senha.';
      else if (passwordMin && password.length < passwordMin) {
        errors.password = `A senha deve ter no mínimo ${passwordMin} caracteres.`;
      }
    }
    setFieldErrors(errors);
    const first = errors.name ? nameRef : errors.email ? emailRef : errors.password ? passwordRef : null;
    first?.current?.focus();
    return Object.keys(errors).length === 0;
  };

  const clearFieldError = (field: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setFormError('');
    if (!validate({ email: true, password: true })) return;
    setIsLoading(true);
    try {
      await signIn(email.trim(), password);
      toastSuccess('Bem-vindo!', 'Login realizado com sucesso');
      navigate(nextTarget);
    } catch (error: unknown) {
      setFormError(friendlyAuthError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setFormError('');
    if (!validate({ name: true, email: true, password: true }, 6)) return;
    setIsLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
      toastSuccess('Solicitação recebida', 'Se o email for válido e ainda não estiver cadastrado, você receberá um link de confirmação.');
      setView('login');
    } catch {
      // Mensagem genérica para evitar enumeração de usuários.
      setFormError('Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setFormError('');
    if (!validate({ email: true })) return;
    setIsLoading(true);
    try {
      await resetPassword(email.trim());
    } catch {
      // Sempre sucesso aparente para não revelar se o email existe.
    } finally {
      setIsLoading(false);
    }
    toastSuccess('Email enviado', 'Se o email estiver cadastrado, você receberá instruções para redefinir sua senha.');
    setView('login');
  };

  const inputClasses = "pl-10 h-11 bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:border-primary focus:ring-primary/20 transition-colors";
  const errorClasses = "text-xs text-red-300 mt-1";
  const backButton = (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-sidebar-accent" onClick={() => setView('login')} aria-label="Voltar ao login">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  return (
    <div className="relative flex min-h-dvh items-center justify-center p-4 overflow-hidden bg-sidebar">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/3 -right-1/4 w-[600px] h-[600px] rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, hsl(36 100% 50%), transparent 70%)' }} />
        <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(207 90% 54%), transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(hsl(210 40% 98%) 1px, transparent 1px), linear-gradient(90deg, hsl(210 40% 98%) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      {/* Sem opacity:0 inline. As classes abaixo só animam quando o usuário
          permite movimento; por padrão TODO o conteúdo já está visível. */}
      <div className="login-entrance relative w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="login-logo mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-2 ring-primary/20">
            <img src={logoUseSistemas} alt="Use Sistemas" className="h-14 w-14 object-contain" />
          </div>
          <h1 className="login-fade text-3xl font-bold text-sidebar-foreground tracking-tight">Use Sistemas</h1>
          <p className="login-fade-late text-primary font-semibold text-sm mt-1">ERP e WMS</p>
        </div>

        <Card className="login-card-anim border-sidebar-border/50 bg-sidebar-accent/30 backdrop-blur-xl shadow-2xl">
          {view === 'forgot' ? (
            <>
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center gap-2">
                  {backButton}
                  <div>
                    <CardTitle className="text-xl text-sidebar-foreground">Recuperar Senha</CardTitle>
                    <CardDescription className="text-sidebar-foreground/50 text-sm">Informe seu email para receber instruções</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResetPassword} noValidate className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email" className="text-sidebar-foreground/70 text-sm">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" aria-hidden="true" />
                      <Input
                        id="reset-email" ref={emailRef} type="email" autoComplete="email" inputMode="email"
                        autoCapitalize="none" spellCheck={false} required autoFocus
                        placeholder="seu@empresa.com" value={email}
                        onChange={(ev) => { setEmail(ev.target.value); clearFieldError('email'); }}
                        aria-invalid={!!fieldErrors.email}
                        aria-describedby={fieldErrors.email ? 'reset-email-error' : undefined}
                        className={inputClasses} disabled={isLoading}
                      />
                    </div>
                    {fieldErrors.email && <p id="reset-email-error" role="alert" className={errorClasses}>{fieldErrors.email}</p>}
                  </div>
                  <Button type="submit" className="w-full h-11 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-all" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : 'Enviar Link de Recuperação'}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : view === 'signup' ? (
            <>
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center gap-2">
                  {backButton}
                  <div>
                    <CardTitle className="text-xl text-sidebar-foreground">Criar Conta</CardTitle>
                    <CardDescription className="text-sidebar-foreground/50 text-sm">Preencha os dados para se cadastrar</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignUp} noValidate className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-sidebar-foreground/70 text-sm">Nome</Label>
                    <div className="relative">
                      <UserPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" aria-hidden="true" />
                      <Input
                        id="signup-name" ref={nameRef} autoComplete="name" required autoFocus
                        placeholder="Seu nome completo" value={name}
                        onChange={(ev) => { setName(ev.target.value); clearFieldError('name'); }}
                        aria-invalid={!!fieldErrors.name}
                        aria-describedby={fieldErrors.name ? 'signup-name-error' : undefined}
                        className={inputClasses} disabled={isLoading}
                      />
                    </div>
                    {fieldErrors.name && <p id="signup-name-error" role="alert" className={errorClasses}>{fieldErrors.name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sidebar-foreground/70 text-sm">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" aria-hidden="true" />
                      <Input
                        id="signup-email" ref={emailRef} type="email" autoComplete="email" inputMode="email"
                        autoCapitalize="none" spellCheck={false} required
                        placeholder="seu@empresa.com" value={email}
                        onChange={(ev) => { setEmail(ev.target.value); clearFieldError('email'); }}
                        aria-invalid={!!fieldErrors.email}
                        aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
                        className={inputClasses} disabled={isLoading}
                      />
                    </div>
                    {fieldErrors.email && <p id="signup-email-error" role="alert" className={errorClasses}>{fieldErrors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sidebar-foreground/70 text-sm">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" aria-hidden="true" />
                      <Input
                        id="signup-password" ref={passwordRef} type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password" required placeholder="Mínimo 6 caracteres" value={password}
                        onChange={(ev) => { setPassword(ev.target.value); clearFieldError('password'); }}
                        aria-invalid={!!fieldErrors.password}
                        aria-describedby={fieldErrors.password ? 'signup-password-error' : undefined}
                        className={cn(inputClasses, 'pr-10')} disabled={isLoading}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword}>
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                    {fieldErrors.password && <p id="signup-password-error" role="alert" className={errorClasses}>{fieldErrors.password}</p>}
                  </div>
                  {formError && <div role="alert" className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{formError}</div>}
                  <Button type="submit" className="w-full h-11 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-all" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : 'Criar Conta'}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl text-sidebar-foreground">Acessar Sistema</CardTitle>
                <CardDescription className="text-sidebar-foreground/50 text-sm">Entre com suas credenciais</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} noValidate className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sidebar-foreground/70 text-sm">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" aria-hidden="true" />
                      <Input
                        id="email" ref={emailRef} type="email" autoComplete="username" inputMode="email"
                        autoCapitalize="none" spellCheck={false} required autoFocus
                        placeholder="seu@empresa.com" value={email}
                        onChange={(ev) => { setEmail(ev.target.value); clearFieldError('email'); }}
                        aria-invalid={!!fieldErrors.email}
                        aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                        className={inputClasses} disabled={isLoading}
                      />
                    </div>
                    {fieldErrors.email && <p id="email-error" role="alert" className={errorClasses}>{fieldErrors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sidebar-foreground/70 text-sm">Senha</Label>
                      <button type="button" onClick={() => setView('forgot')} className="text-xs text-primary hover:text-primary/80 transition-colors">Esqueceu a senha?</button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" aria-hidden="true" />
                      <Input
                        id="password" ref={passwordRef} type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password" required placeholder="••••••••" value={password}
                        onChange={(ev) => { setPassword(ev.target.value); clearFieldError('password'); }}
                        aria-invalid={!!fieldErrors.password}
                        aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                        className={cn(inputClasses, 'pr-10')} disabled={isLoading}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword}>
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                    {fieldErrors.password && <p id="password-error" role="alert" className={errorClasses}>{fieldErrors.password}</p>}
                  </div>
                  {formError && <div role="alert" className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{formError}</div>}
                  <Button type="submit" className="w-full h-11 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : 'Entrar'}
                  </Button>
                </form>
                <div className="mt-5 text-center">
                  <span className="text-sm text-sidebar-foreground/40">Não tem conta? </span>
                  <button type="button" onClick={() => setView('signup')} className="text-sm text-primary font-medium hover:text-primary/80 transition-colors">Criar conta</button>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-sidebar-foreground/30">
          © {new Date().getFullYear()} Use Sistemas. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
