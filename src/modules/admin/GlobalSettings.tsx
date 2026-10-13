import { useState, useEffect } from "react";
import { PageContainer } from "@/shared/components/PageContainer";
import { PageHeader } from "@/shared/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/base/card";
import { Label } from "@/ui/base/label";
import { Switch } from "@/ui/base/switch";
import { Button } from "@/ui/base/button";
import { Input } from "@/ui/base/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import { Settings, Building2, Store, Truck, ShieldCheck, Save, RefreshCw, Database } from "lucide-react";
import { DevSeedControl } from "./components/DevSeedControl";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

const DEFAULT_GLOBAL_SETTINGS = {
    business_model: 'hybrid', // wholesale, retail, hybrid
    tax_regime: 'simples',
    allow_negative_stock: false,
    auto_billing: false,
    use_multi_branch: true,
    default_markup: 30
  };

export default function GlobalSettings() {
  const { company, isLoading: loadingCompany } = useActiveTenant();

  const [loading, setLoading] = useState(false);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [settings, setSettings] = useState(DEFAULT_GLOBAL_SETTINGS);

  useEffect(() => {
    if (company?.settings) {
      setSettings({ ...DEFAULT_GLOBAL_SETTINGS, ...(company.settings as Record<string, unknown>) });
    } else {
      setSettings(DEFAULT_GLOBAL_SETTINGS);
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
        .update({ settings: { ...(company.settings as Record<string, unknown> || {}), ...settings } as any })
        .eq('id', company.id)
        .select('id');

      if (error || !data?.length) throw error || new Error('Atualização não autorizada ou não persistida');
      toast.success("Configurações globais atualizadas");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  };

  if (loadingCompany) return <div className="p-8 text-center"><RefreshCw className="animate-spin inline mr-2" /> Carregando...</div>;

  return (
    <PageContainer>
      <PageHeader 
        title="Configurações da Plataforma" 
        description="Parâmetros globais de funcionamento, regras de negócio e comportamento do ERP."
        icon={Settings}
      />

      <div className="grid gap-6">
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Modelo de Negócio
              </CardTitle>
              <CardDescription>Defina como o sistema deve se comportar em relação a vendas e estoque.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Perfil de Operação</Label>
                <Select 
                  value={settings.business_model} 
                  onValueChange={(v) => setSettings({...settings, business_model: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wholesale">Atacado (Foco em Indústria/Distribuição)</SelectItem>
                    <SelectItem value="retail">Varejo (Foco em PDV/Consumidor Final)</SelectItem>
                    <SelectItem value="hybrid">Híbrido (Multicanal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-0.5">
                  <Label>Venda sem Estoque</Label>
                  <p className="text-xs text-muted-foreground">Permite faturar produtos com saldo negativo.</p>
                </div>
                <Switch 
                  checked={settings.allow_negative_stock}
                  onCheckedChange={(v) => setSettings({...settings, allow_negative_stock: v})}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-0.5">
                  <Label>Faturamento Automático</Label>
                  <p className="text-xs text-muted-foreground">Emite NF-e imediatamente após aprovação do pedido.</p>
                </div>
                <Switch 
                  checked={settings.auto_billing}
                  onCheckedChange={(v) => setSettings({...settings, auto_billing: v})}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                Estrutura Organizacional
              </CardTitle>
              <CardDescription>Gestão de Matriz, Filiais e Unidades de Negócio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-0.5">
                  <Label>Habilitar Multi-Filiais</Label>
                  <p className="text-xs text-muted-foreground">Permite transferências e estoques segregados.</p>
                </div>
                <Switch 
                  checked={settings.use_multi_branch}
                  onCheckedChange={(v) => setSettings({...settings, use_multi_branch: v})}
                />
              </div>

              <div className="space-y-2">
                <Label>Markup Padrão (%)</Label>
                <Input 
                  type="number" 
                  value={settings.default_markup}
                  onChange={(e) => setSettings({...settings, default_markup: Number(e.target.value)})}
                />
                <p className="text-[10px] text-muted-foreground">Sugestão de preço de venda baseada no custo.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <DevSeedControl />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline">Cancelar</Button>
          <Button onClick={handleSave} disabled={loading || loadedCompanyId !== company?.id} className="gap-2">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
