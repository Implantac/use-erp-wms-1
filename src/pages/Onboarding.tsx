import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Building2, Rocket, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/useAppStore';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import { errorMessage } from '@/lib/errors';

// CNPJ: 14 dígitos numéricos (com ou sem máscara)
const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
const ufRegex = /^[A-Z]{2}$/;
const cepRegex = /^\d{5}-?\d{3}$/;
const phoneRegex = /^[\d\s()+-]{8,20}$/;

const onboardingSchema = z.object({
  company_name: z.string().trim().min(2, 'Razão social muito curta').max(150, 'Razão social muito longa'),
  cnpj: z.string().trim().regex(cnpjRegex, 'CNPJ inválido (use formato 00.000.000/0000-00)'),
  segment: z.enum(['confeccao', 'industria', 'distribuicao', 'varejo', 'servicos', 'outro']),
  phone: z.string().trim().regex(phoneRegex, 'Telefone inválido').max(20).optional().or(z.literal('')),
  address_street: z.string().trim().min(2, 'Informe o logradouro real').max(150),
  address_number: z.string().trim().min(1, 'Informe o número ou S/N, se aplicável').max(20),
  address_neighborhood: z.string().trim().min(2, 'Informe o bairro real').max(80),
  address_city: z.string().trim().min(2, 'Informe a cidade real').max(80),
  address_state: z.string().trim().regex(ufRegex, 'UF deve ter 2 letras maiúsculas'),
  address_zip: z.string().trim().regex(cepRegex, 'Informe um CEP válido'),
});

const SEGMENTS = [
  { value: 'confeccao', label: 'Confecção / Moda' },
  { value: 'industria', label: 'Indústria / Manufatura' },
  { value: 'distribuicao', label: 'Distribuição / Atacado' },
  { value: 'varejo', label: 'Varejo' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'outro', label: 'Outro' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [form, setForm] = useState({
    company_name: '',
    cnpj: '',
    segment: 'confeccao',
    phone: '',
    address_street: '',
    address_number: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    address_zip: '',
  });

  // If user already has a company, send to dashboard
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      navigate('/login');
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.company_id) {
        navigate('/dashboard', { replace: true });
      } else {
        setChecking(false);
      }
    })();
  }, [isAuthenticated, user?.id, navigate]);

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
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('bootstrap_tenant', {
        _company_name: form.company_name,
        _cnpj: form.cnpj,
        _segment: form.segment,
        _address_street: form.address_street,
        _address_number: form.address_number,
        _address_neighborhood: form.address_neighborhood,
        _address_city: form.address_city,
        _address_state: form.address_state,
        _address_zip: form.address_zip,
        _phone: form.phone || null,
        _email: user?.email || null,
      });
      if (error) throw error;
      toastSuccess('Empresa criada!', 'Seu trial de 14 dias começou agora.');
      // Force reload so all stores rehydrate with new tenant context
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const raw = errorMessage(err);
      const msg = raw.includes('user_already_in_tenant')
        ? 'Você já está vinculado a uma empresa.'
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
                    onChange={(e) => update('cnpj')(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="segment">Segmento</Label>
                  <Select value={form.segment} onValueChange={update('segment')}>
                    <SelectTrigger id="segment"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => update('phone')(e.target.value)}
                    placeholder="(11) 99999-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_zip">CEP *</Label>
                  <Input
                    id="address_zip"
                    value={form.address_zip}
                    onChange={(e) => update('address_zip')(e.target.value)}
                    placeholder="00000-000"
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
