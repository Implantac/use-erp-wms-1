import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Skeleton } from '@/ui/base/skeleton';
import { Users, Target, TrendingUp, Sparkles, Plus, Clock } from 'lucide-react';
import { useSalesFunnel, useCreateFunnelItem, FUNNEL_STAGES } from '@/hooks/commercial/useSalesFunnel';
import { useClients } from '@/hooks/commercial/useClients';
import { useSalesReps } from '@/hooks/commercial/useSalesReps';
import { useFunnelMetrics } from './sales-funnel/useFunnelMetrics';
import { FunnelFormDialog } from './sales-funnel/FunnelFormDialog';
import { EMPTY_FORM, type FunnelFormData } from './sales-funnel/formDefaults';
import { formatBRL } from '@/lib/formatters';
import { toastError } from '@/lib/toastHelpers';
import { EmptyState } from '@/shared/components/EmptyState';
import { cn } from '@/lib/utils';

export default function CRMDashboard() {
  const { data: funnel = [], isLoading } = useSalesFunnel();
  const { data: clients = [] } = useClients();
  const { data: reps = [] } = useSalesReps();
  const createItem = useCreateFunnelItem();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<FunnelFormData>(EMPTY_FORM);

  const { stats, stageMetrics, stagnantItems, funnelChartData } = useFunnelMetrics(funnel);

  const maxCount = Math.max(1, ...funnelChartData.map((d) => d.count));
  const avgCycle = (() => {
    const won = funnel.filter((f) => f.status === 'won' && f.won_date);
    if (won.length === 0) return null;
    const total = won.reduce((s, f) => s + (new Date(f.won_date as string).getTime() - new Date(f.created_at).getTime()), 0);
    return Math.round(total / won.length / 86400000);
  })();

  const handleSave = async () => {
    if (!formData.title) return toastError('Título obrigatório');
    await createItem.mutateAsync({
      title: formData.title,
      description: formData.description || null,
      stage: formData.stage,
      value: parseFloat(formData.value) || 0,
      probability: parseInt(formData.probability) || 10,
      expected_close_date: formData.expected_close_date || null,
      contact_name: formData.contact_name || null,
      contact_email: formData.contact_email || null,
      contact_phone: formData.contact_phone || null,
      source: formData.source || null,
      notes: formData.notes || null,
      client_id: formData.client_id || null,
      sales_rep_id: formData.sales_rep_id || null,
    } as never);
    setIsFormOpen(false);
    setFormData(EMPTY_FORM);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM Enterprise</h1>
          <p className="text-muted-foreground">Gestão estratégica de leads e oportunidades.</p>
        </div>
        <Button className="gap-2" onClick={() => { setFormData(EMPTY_FORM); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4" />
          Nova Oportunidade
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Oportunidades abertas</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.openCount}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.wonCount} ganhas · {stats.lostCount} perdidas</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatBRL(stats.totalValue)}</div>
              <Badge variant="secondary" className="mt-1">Ponderado {formatBRL(stats.weightedValue)}</Badge>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Taxa de conversão</CardTitle>
              <Sparkles className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">Ganho {formatBRL(stats.wonValue)}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Ciclo de venda</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgCycle !== null ? `${avgCycle} dias` : '—'}</div>
              <p className="text-xs text-muted-foreground mt-1">Média das oportunidades ganhas</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Funil de vendas consolidado</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px]" />
            ) : funnelChartData.length === 0 ? (
              <EmptyState
                icon={Target}
                title="Nenhuma oportunidade aberta"
                description="Crie a primeira oportunidade para acompanhar o funil."
                action={{ label: 'Nova Oportunidade', onClick: () => { setFormData(EMPTY_FORM); setIsFormOpen(true); } }}
              />
            ) : (
              <div className="h-[300px] flex items-end justify-between gap-2 px-4">
                {funnelChartData.map((s, i) => (
                  <div key={s.name} className="flex-1 flex flex-col items-center gap-2 justify-end h-full">
                    <span className="text-xs font-semibold">{s.count}</span>
                    <div
                      className={cn('w-full rounded-t-lg bg-primary transition-all hover:brightness-110')}
                      style={{ height: `${Math.max(6, (s.count / maxCount) * 85)}%`, opacity: 0.35 + (i / Math.max(1, funnelChartData.length)) * 0.65 }}
                      title={formatBRL(s.value)}
                    />
                    <span className="text-[10px] font-medium text-muted-foreground text-center uppercase tracking-tighter">{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Atenção necessária</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-24" />
            ) : stagnantItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma oportunidade parada há mais de 14 dias.</p>
            ) : (
              stagnantItems.slice(0, 5).map((item) => (
                <div key={item.id} className="p-3 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    {item.title}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {FUNNEL_STAGES.find((s) => s.value === item.stage)?.label || item.stage} · {formatBRL(item.value)}
                  </p>
                </div>
              ))
            )}
            {!isLoading && stageMetrics.length > 0 && (
              <p className="text-xs text-muted-foreground pt-2 border-t">
                {stageMetrics.filter((s) => s.count > 0).length} etapas com oportunidades ativas.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <FunnelFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        formData={formData}
        setFormData={setFormData}
        editing={false}
        saving={createItem.isPending}
        onSave={handleSave}
        clients={clients as Array<{ id: string; name: string }>}
        reps={reps as Array<{ id: string; name: string }>}
      />
    </div>
  );
}
