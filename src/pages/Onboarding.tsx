import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, CheckCircle2, Loader2, Rocket } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/system/useAuth';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import { errorMessage } from '@/lib/errors';
import { maskCEP, maskCNPJ, maskPhone, validateCNPJ } from '@/lib/maskUtils';

// CNPJ: 14 dígitos numéricos (com ou sem máscara) + dígitos verificadores.
const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
const ufRegex = /^[A-Z]{2}$/;
const cepRegex = /^\d{5}-?\d{3}$/;
const phoneRegex = /^[\d\s()+-]{8,20}$/;

const segmentValues = [
  'textile',
  'fio',
  'tecelagem',
  'dyeing',
  'laundry',
  'animal_feed',
  'food_factory',
  'chemicals',
  'apparel',
  'industry',
  'distribution',
  'retail',
  'services',
  'general',
] as const;

type SegmentValue = (typeof segmentValues)[number];

const onboardingSchema = z.object({
  company_name: z.string().trim().min(2, 'Razão social muito curta').max(150, 'Razão social muito longa'),
  cnpj: z.string().trim()
    .regex(cnpjRegex, 'CNPJ inválido (use formato 00.000.000/0000-00)')
    .refine(validateCNPJ, 'CNPJ inválido: confira os dígitos verificadores'),
  segment: z.enum(segmentValues, { message: 'Selecione o ramo principal da empresa' }),
  secondary_segment: z.enum([...segmentValues, '']).optional(),
  phone: z.string().trim().regex(phoneRegex, 'Telefone inválido').max(20).optional().or(z.literal('')),
  address_street: z.string().trim().min(2, 'Informe o logradouro real').max(150),
  address_number: z.string().trim().min(1, 'Informe o número ou S/N, se aplicável').max(20),
  address_complement: z.string().trim().max(80, 'Complemento muito longo').optional().or(z.literal('')),
  address_neighborhood: z.string().trim().min(2, 'Informe o bairro real').max(80),
  address_city: z.string().trim().min(2, 'Informe a cidade real').max(80),
  address_state: z.string().trim().regex(ufRegex, 'UF deve ter 2 letras maiúsculas'),
  address_zip: z.string().trim().regex(cepRegex, 'Informe um CEP válido'),
}).superRefine((data, ctx) => {
  if (data.secondary_segment && data.secondary_segment === data.segment) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['secondary_segment'],
      message: 'O ramo secundário deve ser diferente do principal',
    });
  }
});

const SEGMENTS: Array<{ value: SegmentValue; label: string }> = [
  { value: 'textile', label: 'Têxtil integrada' },
  { value: 'fio', label: 'Fiação' },
  { value: 'tecelagem', label: 'Tecelagem' },
  { value: 'dyeing', label: 'Tinturaria' },
  { value: 'laundry', label: 'Lavanderia industrial' },
  { value: 'animal_feed', label: 'Indústria de ração animal' },
  { value: 'food_factory', label: 'Indústria de alimentos' },
  { value: 'chemicals', label: 'Indústria química e de limpeza' },
  { value: 'apparel', label: 'Confecção / Moda' },
  { value: 'industry', label: 'Indústria / Manufatura' },
  { value: 'distribution', label: 'Distribuição / Atacado' },
  { value: 'retail', label: 'Varejo' },
  { value: 'services', label: 'Serviços' },
  { value: 'general', label: 'Geral / Outros' },
];

const TEXTILE_SEGMENTS = new Set<SegmentValue>(['textile', 'fio', 'tecelagem', 'dyeing', 'laundry']);

const INDUSTRIAL_FAMILY_BY_SEGMENT: Partial<Record<SegmentValue, string>> = {
  fio: 'spinning',
  tecelagem: 'weaving',
  dyeing: 'dyeing',
  laundry: 'laundry',
  animal_feed: 'animal_feed',
  food_factory: 'food',
  chemicals: 'chemicals',
  apparel: 'apparel',
};

const INDUSTRIAL_STAGE_BY_FAMILY: Record<string, string> = {
  spinning: 'spinning',
  weaving: 'weaving',
  dyeing: 'dyeing',
};

type BootstrapTenantResult = {
  company_id?: string;
  branch_id?: string;
  subscription_id?: string | null;
};

function segmentLabel(value: string) {
  return SEGMENTS.find((segment) => segment.value === value)?.label ?? value;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { loading: authLoading, hasSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string | null } | null>(null);
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [completionWarning, setCompletionWarning] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_name: '',
    cnpj: '',
    segment: '',
    secondary_segment: '',
    phone: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    address_zip: '',
  });

  // Wait until Supabase has finished restoring the session before deciding
  // whether to send the user to /login. The previous implementation read a
  // still-hydrating app store and bounced authenticated users back to login.
  useEffect(() => {
    if (authLoading) {
      setChecking(true);
      return;
    }

    if (!hasSession) {
      navigate('/login?next=%2Fonboarding', { replace: true });
      return;
    }

    let active = true;
    setChecking(true);
    setCheckError(null);

    (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (userError || !userData.user) {
        navigate('/login?next=%2Fonboarding', { replace: true });
        return;
      }

      setSessionUser({ id: userData.user.id, email: userData.user.email ?? null });

      const { data, error } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (!active) return;
      if (error) throw error;
      if (!data) {
        setCheckError('Seu perfil de acesso ainda não foi criado. Aguarde alguns segundos e tente novamente.');
        setChecking(false);
        return;
      }
      if (data.company_id) {
        navigate('/dashboard', { replace: true });
        return;
      }
      setChecking(false);
    })().catch((error: unknown) => {
      if (!active) return;
      setCheckError(errorMessage(error, 'Não foi possível verificar se você já possui uma empresa.'));
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [authLoading, hasSession, navigate, checkAttempt]);

  const update = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = onboardingSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toastError(first?.message || 'Dados inválidos');
      return;
    }
    if (!sessionUser) {
      toastError('Sua sessão ainda não foi confirmada. Aguarde e tente novamente.');
      return;
    }

    const input = parsed.data;
    const selectedSegments = [input.segment, input.secondary_segment].filter(Boolean) as SegmentValue[];
    // Uma empresa com duas operações têxteis (ex.: tecelagem + tinturaria)
    // usa o perfil têxtil integrado para enxergar PCP, WMS e Comercial
    // juntos; os dois ramos continuam gravados separadamente abaixo.
    const effectiveSegment =
      selectedSegments.length > 1 && selectedSegments.every((segment) => TEXTILE_SEGMENTS.has(segment))
        ? 'textile'
        : input.segment;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('bootstrap_tenant', {
        _company_name: input.company_name,
        _cnpj: input.cnpj,
        _segment: effectiveSegment,
        _address_street: input.address_street,
        _address_number: input.address_number,
        _address_neighborhood: input.address_neighborhood,
        _address_city: input.address_city,
        _address_state: input.address_state,
        _address_zip: input.address_zip,
        _phone: input.phone || null,
        _email: sessionUser.email,
      });
      if (error) throw error;

      const result = (data ?? {}) as unknown as BootstrapTenantResult;
      if (!result.company_id) {
        throw new Error('A empresa foi processada, mas o sistema não retornou o identificador dela.');
      }
      setCreatedCompanyId(result.company_id);

      // bootstrap_tenant aceita um único segmento e não recebe complemento.
      // Gravamos os dados complementares logo em seguida, já como admin da
      // empresa recém-criada (a policy de UPDATE permite admin/manager da
      // própria empresa).
      const patchWarnings: string[] = [];
      const companyPatch: {
        sub_segment?: string;
        operation_types?: string[];
        address_complement?: string;
        settings?: Json;
      } = {};
      if (input.secondary_segment) {
        companyPatch.sub_segment = selectedSegments.map(segmentLabel).join(' e ');
        companyPatch.operation_types = selectedSegments;
      }
      const industrialFamilies = Array.from(new Set(
        selectedSegments
          .map((segment) => INDUSTRIAL_FAMILY_BY_SEGMENT[segment])
          .filter((family): family is string => Boolean(family)),
      ));
      if (industrialFamilies.length > 0) {
        const stages = Object.fromEntries(
          industrialFamilies
            .map((family) => INDUSTRIAL_STAGE_BY_FAMILY[family])
            .filter(Boolean)
            .map((stage) => [stage, 'internal']),
        );
        const profile = industrialFamilies.includes('weaving') && industrialFamilies.includes('dyeing')
          ? 'weaving_dyeing'
          : industrialFamilies.includes('spinning') && industrialFamilies.includes('weaving')
            ? 'spinning_weaving'
            : industrialFamilies.includes('dyeing')
              ? 'dyeing_finishing'
              : effectiveSegment === 'textile'
                ? 'integrated_textile'
                : null;
        companyPatch.settings = {
          industrial: { profile, families: industrialFamilies, stages },
        };
      }
      if (input.address_complement) {
        companyPatch.address_complement = input.address_complement;
      }
      if (Object.keys(companyPatch).length > 0) {
        const { error: companyPatchError } = await supabase
          .from('companies')
          .update(companyPatch)
          .eq('id', result.company_id);
        if (companyPatchError) patchWarnings.push('ramos/complemento da empresa');
      }
      // Aplica o pacote de módulos do nicho escolhido (Fase 1): o plano
      // compartilhado é clonado para a empresa e só os módulos do ramo
      // ficam habilitados. Falha aqui não bloqueia a entrada — vira aviso.
      const { error: nicheError } = await supabase.rpc('set_company_niche', {
        p_company_id: result.company_id,
        p_segment: effectiveSegment,
        p_process_families: industrialFamilies,
      });
      if (nicheError) patchWarnings.push('pacote de módulos do nicho');

      if (input.address_complement && result.branch_id) {
        const { error: branchPatchError } = await supabase
          .from('branches')
          .update({ address_complement: input.address_complement })
          .eq('id', result.branch_id);
        if (branchPatchError) patchWarnings.push('complemento da filial matriz');
      }

      if (patchWarnings.length > 0) {
        setCompletionWarning(
          `A empresa foi criada, mas não foi possível salvar ${patchWarnings.join(' e ')}. ` +
          'Você já pode entrar no sistema e completar esses dados em Administração > Empresas.',
        );
        return;
      }

      toastSuccess('Empresa criada!', 'Seu trial de 14 dias começou agora.');
      // Force reload so all stores rehydrate with new tenant context
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const raw = errorMessage(err);
      const msg = raw.includes('user_already_in_tenant')
        ? 'Você já está vinculado a uma empresa.'
        : raw.includes('missing_or_invalid_required_company_fields')
          ? 'Confira os campos obrigatórios: CNPJ, endereço, cidade, UF e CEP.'
          : raw.includes('profile_not_found')
            ? 'Seu perfil de acesso ainda não foi criado. Saia e entre novamente.'
            : raw.includes('unauthenticated')
              ? 'Sua sessão expirou. Entre novamente para concluir o cadastro.'
              : raw || 'Não foi possível concluir o cadastro.';
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (checkError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Não foi possível abrir o cadastro</CardTitle>
            <CardDescription>{checkError}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={() => setCheckAttempt((attempt) => attempt + 1)}>
              Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => navigate('/login?next=%2Fonboarding', { replace: true })}>
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (createdCompanyId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Empresa criada</CardTitle>
            <CardDescription>{completionWarning}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => { window.location.href = '/dashboard'; }}>
              Acessar o sistema
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background py-10">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Rocket className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Bem-vindo! Vamos configurar sua empresa</h1>
          <p className="mt-2 text-muted-foreground">
            Cadastre dados reais da empresa. Configuração fiscal e homologação são etapas separadas. Você ganha <strong>14 dias grátis</strong> no plano Starter.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Dados da Empresa
            </CardTitle>
            <CardDescription>
              Esses dados serão usados em notas fiscais, relatórios e documentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="company_name">Razão Social *</Label>
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={(e) => update('company_name')(e.target.value)}
                    placeholder="Empresa Exemplo LTDA"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ *</Label>
                  <Input
                    id="cnpj"
                    value={form.cnpj}
                    onChange={(e) => update('cnpj')(maskCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => update('phone')(maskPhone(e.target.value))}
                    placeholder="(11) 99999-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="segment">Ramo principal *</Label>
                  <Select value={form.segment} onValueChange={update('segment')}>
                    <SelectTrigger id="segment"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondary_segment">Ramo secundário (opcional)</Label>
                  <Select
                    value={form.secondary_segment || 'none'}
                    onValueChange={(value) => update('secondary_segment')(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger id="secondary_segment"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {SEGMENTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_zip">CEP *</Label>
                  <Input
                    id="address_zip"
                    value={form.address_zip}
                    onChange={(e) => update('address_zip')(maskCEP(e.target.value))}
                    placeholder="00000-000"
                    inputMode="numeric"
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address_street">Endereço *</Label>
                  <Input
                    id="address_street"
                    value={form.address_street}
                    onChange={(e) => update('address_street')(e.target.value)}
                    placeholder="Rua / Avenida"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_number">Número *</Label>
                  <Input
                    id="address_number"
                    value={form.address_number}
                    onChange={(e) => update('address_number')(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    value={form.address_complement}
                    onChange={(e) => update('address_complement')(e.target.value)}
                    placeholder="Galpão, sala, bloco..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_neighborhood">Bairro *</Label>
                  <Input
                    id="address_neighborhood"
                    value={form.address_neighborhood}
                    onChange={(e) => update('address_neighborhood')(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_city">Cidade *</Label>
                  <Input
                    id="address_city"
                    value={form.address_city}
                    onChange={(e) => update('address_city')(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_state">UF *</Label>
                  <Input
                    id="address_state"
                    value={form.address_state}
                    maxLength={2}
                    onChange={(e) => update('address_state')(e.target.value.toUpperCase())}
                    required
                  />
                </div>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">O que vamos preparar para você:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                      <li>Empresa e filial matriz cadastradas</li>
                      <li>Perfil de administrador atribuído</li>
                      <li>Plano Starter ativo em trial por 14 dias</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Configurando...
                  </>
                ) : (
                  <>Concluir cadastro e iniciar trial</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
