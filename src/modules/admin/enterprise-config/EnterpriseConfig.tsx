import { useState, useEffect } from "react";
import { INDUSTRIAL_PROFILES, INDUSTRIAL_STAGES, parseIndustrialPlanning, type IndustrialProfile, type IndustrialStage, type StageMode } from "@/config/industrialProfile";
import { PageContainer } from "@/shared/components/PageContainer";
import { PageHeader } from "@/shared/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/base/card";
import { Label } from "@/ui/base/label";
import { Switch } from "@/ui/base/switch";
import { Button } from "@/ui/base/button";
import { Input } from "@/ui/base/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import { 
  Building2, 
  Store, 
  ShieldCheck, 
  Save, 
  RefreshCw, 
  LayoutDashboard,
  Wallet,
  ShoppingCart,
  Factory,
  Package,
  FileText,
  UserCheck,
  Zap,
  ChevronRight,
  History,
  Lock,
  Workflow
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/base/tabs";
import { Badge } from "@/ui/base/badge";
import { Separator } from "@/ui/base/separator";
import { OperationalFeedback } from "@/components/shared/OperationalFeedback";

const DEFAULT_ENTERPRISE_SETTINGS = {
    business_model: 'hybrid',
    tax_regime: 'simples',
    allow_negative_stock: false,
    auto_billing: false,
    use_multi_branch: true,
    default_markup: 30,
    modules: {
      commercial: true,
      logistics: true,
      production: false,
      financial: true,
      fiscal: true,
      governance: true,
      audit: true
    },
    approvals: {
      discount_threshold: 10,
      order_min_value: 0,
      require_manager_for_cancellation: true
    }
  };

export default function EnterpriseConfig() {
  const { company, isLoading: loadingCompany } = useActiveTenant();
  const [loading, setLoading] = useState(false);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [industrial, setIndustrial] = useState(() => parseIndustrialPlanning(null));
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_ENTERPRISE_SETTINGS, modules: { ...DEFAULT_ENTERPRISE_SETTINGS.modules }, approvals: { ...DEFAULT_ENTERPRISE_SETTINGS.approvals } }));

  useEffect(() => {
    if (company?.settings) {
      const saved = company.settings as Record<string, unknown>;
      setSettings({
        ...DEFAULT_ENTERPRISE_SETTINGS,
        ...saved,
        modules: { ...DEFAULT_ENTERPRISE_SETTINGS.modules, ...(saved.modules as Record<string, boolean> || {}) },
        approvals: { ...DEFAULT_ENTERPRISE_SETTINGS.approvals, ...(saved.approvals as Record<string, number | boolean> || {}) },
      });
      setIndustrial(parseIndustrialPlanning(saved.industrial));
    } else {
      setSettings({ ...DEFAULT_ENTERPRISE_SETTINGS, modules: { ...DEFAULT_ENTERPRISE_SETTINGS.modules }, approvals: { ...DEFAULT_ENTERPRISE_SETTINGS.approvals } });
      setIndustrial(parseIndustrialPlanning(null));
    }
    setLoadedCompanyId(company?.id ?? null);
  }, [company]);

  const handleSave = async () => {
    if (!company || loadedCompanyId !== company.id) {
      toast.error('Aguarde carregar a configuração da empresa ativa.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .update({ settings: { ...(company.settings as Record<string, unknown> || {}), ...settings, industrial } as any })
        .eq('id', company.id)
        .select('id');

      if (error || !data?.length) throw error || new Error('Atualização não autorizada ou não persistida');
      toast.success("Configuração empresarial atualizada com sucesso");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar configuração empresarial");
    } finally {
      setLoading(false);
    }
  };

  if (loadingCompany) return (
    <div className="flex items-center justify-center h-screen">
      <RefreshCw className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <PageContainer>
      <PageHeader 
        title="Configuração da Empresa" 
        description="Preferências empresariais; não substituem autorização, regras transacionais ou homologação."
        icon={Building2}
      >
        <div className="flex gap-2">
           <Button variant="outline" size="sm">Histórico de Alterações</Button>
           <Button onClick={handleSave} disabled={loading || loadedCompanyId !== company?.id} size="sm" className="gap-2">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Tudo
          </Button>
        </div>
      </PageHeader>

      <p role="note" className="text-sm text-warning">
        Alterar estas preferências não habilita módulos, emissão fiscal, estoque negativo, aprovações ou processos industriais. Acesso e regras dependem do backend e de homologação por cliente.
      </p>
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="general">Geral & Modelo</TabsTrigger>
          <TabsTrigger value="modules">Preferências de módulos</TabsTrigger>
          <TabsTrigger value="industrial">Planejamento industrial</TabsTrigger>
          <TabsTrigger value="processes">Regras & Aprovações</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal & Contábil</TabsTrigger>
          <TabsTrigger value="governance">Governança</TabsTrigger>
        </TabsList>

        <TabsContent value="industrial">
          <Card>
            <CardHeader>
              <CardTitle>Perfil e etapas industriais</CardTitle>
              <CardDescription>Planejamento por empresa. Tecelagem (tecido plano) e malharia (malha) são etapas distintas e podem coexistir. Não habilita produção, estoque, qualidade ou acesso a dados: processos dependem de autorização e homologação próprias.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Perfil industrial</Label>
                <Select value={industrial.profile ?? 'none'} onValueChange={value => setIndustrial({ profile: value === 'none' ? null : value as IndustrialProfile, stages: {} })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não configurado</SelectItem>
                    {Object.entries(INDUSTRIAL_PROFILES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {industrial.profile && Object.entries(INDUSTRIAL_STAGES).map(([key, label]) => {
                const stage = key as IndustrialStage;
                return <div key={key} className="flex items-center justify-between gap-4">
                  <Label>{label}</Label>
                  <Select value={industrial.stages[stage] ?? 'unused'} onValueChange={value => setIndustrial(prev => {
                    const stages = { ...prev.stages };
                    if (value === 'unused') delete stages[stage];
                    else stages[stage] = value as StageMode;
                    return { ...prev, stages };
                  })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unused">Não utilizada</SelectItem>
                      <SelectItem value="internal">Interna</SelectItem>
                      <SelectItem value="outsourced">Terceirizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>;
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-primary/10 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Store className="h-5 w-5 text-primary" />
                  Perfil Operacional
                </CardTitle>
                <CardDescription>Determine o DNA da sua operação.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Segmento / Modelo</Label>
                  <Select 
                    value={settings.business_model} 
                    onValueChange={(v) => setSettings({...settings, business_model: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wholesale">Indústria / Atacado</SelectItem>
                      <SelectItem value="retail">Varejo / PDV</SelectItem>
                      <SelectItem value="hybrid">Híbrido (Multicanal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/5">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Multi-Filiais</Label>
                    <p className="text-xs text-muted-foreground italic">Preferência de configuração; não habilita transferências sem fluxo homologado.</p>
                  </div>
                  <Switch 
                    checked={settings.use_multi_branch}
                    onCheckedChange={(v) => setSettings({...settings, use_multi_branch: v})}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/10 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5 text-primary" />
                  Políticas de Estoque
                </CardTitle>
                <CardDescription>Controle de movimentação e inventário.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/5">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold text-destructive">Permitir Saldo Negativo</Label>
                    <p className="text-xs text-muted-foreground italic">Venda de produtos sem confirmação de estoque físico.</p>
                  </div>
                  <Switch 
                    checked={settings.allow_negative_stock}
                    onCheckedChange={(v) => setSettings({...settings, allow_negative_stock: v})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Markup de Sugestão (%)</Label>
                  <Input 
                    type="number" 
                    value={settings.default_markup}
                    onChange={(e) => setSettings({...settings, default_markup: Number(e.target.value)})}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="modules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de módulos</CardTitle>
              <CardDescription>Preferências de planejamento. Estes controles não concedem acesso, licença ou ativação operacional.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { id: 'commercial', label: 'Comercial & CRM', icon: ShoppingCart },
                { id: 'logistics', label: 'Logística & WMS', icon: Store },
                { id: 'production', label: 'Indústria & PCP', icon: Factory },
                { id: 'financial', label: 'Financeiro', icon: Wallet },
                { id: 'fiscal', label: 'Fiscal & NFe', icon: ShieldCheck },
              ].map((mod) => (
                <div key={mod.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <mod.icon className="h-5 w-5" />
                    </div>
                    <Label className="cursor-pointer">{mod.label}</Label>
                  </div>
                  <Switch 
                    checked={(settings.modules as any)[mod.id]}
                    onCheckedChange={(v) => setSettings({
                      ...settings, 
                      modules: { ...settings.modules, [mod.id]: v }
                    })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processes" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Regras de Venda
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Limite de Desconto sem Aprovação (%)</Label>
                  <Input 
                    type="number" 
                    value={settings.approvals.discount_threshold}
                    onChange={(e) => setSettings({
                      ...settings, 
                      approvals: { ...settings.approvals, discount_threshold: Number(e.target.value) }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-xl">
                  <Label>Exigir Aprovação para Cancelar Pedido Faturado</Label>
                  <Switch 
                    checked={settings.approvals.require_manager_for_cancellation}
                    onCheckedChange={(v) => setSettings({
                      ...settings, 
                      approvals: { ...settings.approvals, require_manager_for_cancellation: v }
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  Ciclo de Vida de Operações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Exemplo visual de estados; não define transições reais nem autoriza operações:</p>
                <div className="space-y-2">
                  {['Rascunho', 'Aguardando Aprovação', 'Reservado', 'Em Separação', 'Faturado', 'Concluído'].map((status, idx) => (
                    <div key={status} className="flex items-center gap-3 text-sm">
                      <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center p-0">{idx + 1}</Badge>
                      <span className="font-medium">{status}</span>
                      {idx < 5 && <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="governance" className="space-y-6">
          <Card className="border-l-4 border-l-primary shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5 pb-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle className="text-lg font-black uppercase tracking-tight text-primary">Controle de Governança & Auditoria</CardTitle>
                  <CardDescription className="text-xs font-medium">Configurações de conformidade, trilha imutável e segurança UEEF SEC-LEVEL 3.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <OperationalFeedback 
                type="success"
                title="Governança Fase 3 & 4 Consolidadas"
                message="O Ledger Logístico e o OrderWizard Pro estão operando em 100%. Iniciando implantação dos motores de Inteligência Preditiva (Fase 5)."
              />


              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold flex items-center gap-2">
                      <History className="h-4 w-4 text-primary" />
                      Ledger Logístico Imutável
                    </Label>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">Registrar cada mudança de estado (Requested {"->"} Received)</p>
                  </div>
                  <Switch 
                    checked={settings.modules.governance}
                    onCheckedChange={(v) => setSettings({ ...settings, modules: { ...settings.modules, governance: v } })}
                  />
                </div>

                <div className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold flex items-center gap-2">
                      <Lock className="h-4 w-4 text-primary" />
                      Trilha de Auditoria do Sistema
                    </Label>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">Log de atividades administrativas e acessos sensíveis</p>
                  </div>
                  <Switch 
                    checked={settings.modules.audit}
                    onCheckedChange={(v) => setSettings({ ...settings, modules: { ...settings.modules, audit: v } })}
                  />
                </div>
              </div>

              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Workflow className="h-3 w-3" /> Automação e Alçadas
                </h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2 border p-3 rounded-lg bg-muted/10">
                    <Label className="text-xs font-bold uppercase">Alçada de Compra</Label>
                    <p className="text-[9px] text-muted-foreground leading-tight">Valor máximo para aprovação automática sem intervenção da diretoria.</p>
                  </div>
                  <div className="space-y-2 border p-3 rounded-lg bg-muted/10">
                    <Label className="text-xs font-bold uppercase">Faturamento Automático</Label>
                    <p className="text-[9px] text-muted-foreground leading-tight">Disparo automático de NF-e ao concluir separação WMS.</p>
                  </div>
                  <div className="space-y-2 border p-3 rounded-lg bg-muted/10">
                    <Label className="text-xs font-bold uppercase">Restrição de Tenant</Label>
                    <p className="text-[9px] text-muted-foreground leading-tight">Bloqueio estrito de company_id em nível de trigger no Postgres.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
