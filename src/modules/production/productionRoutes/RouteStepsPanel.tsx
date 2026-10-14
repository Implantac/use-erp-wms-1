import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Badge } from '@/ui/base/badge';
import { Skeleton } from '@/ui/base/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { EmptyState } from '@/shared/components/EmptyState';
import { Plus, X, GitBranch, Clock, Timer, Zap, ChevronRight, Trash2 } from 'lucide-react';
import { toSafeNumber } from '@/lib/numericValidation';
import { useProductionRouteSteps, ProductionRouteStep } from '@/hooks/production/useProductionRoutes';
import { useProductionSectors } from '@/hooks/production/useProductionSectors';
import { useProductionResources } from '@/hooks/production/useProductionResources';
import { useProductionSteps } from '@/hooks/production/useProductionSteps';

export function RouteStepsPanel({ routeId, onClose }: { routeId: string; onClose: () => void }) {
  const { steps, loading, addStep, removeStep } = useProductionRouteSteps(routeId);
  const { activeSectors } = useProductionSectors();
  const { resources } = useProductionResources();
  const { steps: registeredOperations } = useProductionSteps();
  const activeNameCounts = registeredOperations.filter(op => op.is_active).reduce((counts, op) => {
    counts.set(op.name, (counts.get(op.name) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const selectableOperations = registeredOperations.filter(op => op.is_active && activeNameCounts.get(op.name) === 1);
  const [showAdd, setShowAdd] = useState(false);
  const [newStep, setNewStep] = useState<Partial<ProductionRouteStep>>({ step_name: '', sequence: 1, sector_id: null, resource_id: null, setup_time_minutes: 0, operation_time_minutes: 0 });

  const handleAdd = async () => {
    if (!selectableOperations.some(op => op.name === newStep.step_name)) return;
    const ok = await addStep({ ...newStep, sequence: steps.length + 1 });
    if (ok) {
      setShowAdd(false);
      setNewStep({ step_name: '', sequence: 1, sector_id: null, resource_id: null, setup_time_minutes: 0, operation_time_minutes: 0 });
    }
  };

  const totalTime = steps.reduce((s, st) => s + (st.setup_time_minutes || 0) + (st.operation_time_minutes || 0), 0);
  const totalSetup = steps.reduce((s, st) => s + (st.setup_time_minutes || 0), 0);
  const totalOp = steps.reduce((s, st) => s + (st.operation_time_minutes || 0), 0);

  return (
    <Card className="border-border/40">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Etapas da Rota
          </CardTitle>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" />{steps.length} etapas</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />Setup: {totalSetup}min</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Op: {totalOp}min</span>
            <Badge variant="secondary" className="text-xs font-mono">{totalTime} min total</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} variant={showAdd ? 'secondary' : 'default'}>
            <Plus className="h-4 w-4 mr-1" />Etapa
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="border border-dashed border-primary/30 rounded-xl p-4 mb-4 bg-primary/5">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center"><Plus className="h-3 w-3 text-primary" /></div>
              Nova Etapa
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1"><Label className="text-xs">Operação cadastrada *</Label>
                <Select value={newStep.step_name || ''} onValueChange={name => setNewStep({ ...newStep, step_name: name })}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma operação ativa" /></SelectTrigger>
                  <SelectContent>{selectableOperations.map(op => <SelectItem key={op.id} value={op.name}>{op.name}</SelectItem>)}</SelectContent>
                </Select>
                {selectableOperations.length === 0 && <p className="text-xs text-warning">Cadastre uma operação ativa com nome único para esta empresa antes de adicionar etapas.</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Setor</Label>
                <Select value={newStep.sector_id || ''} onValueChange={v => setNewStep({ ...newStep, sector_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{activeSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs">Recurso</Label>
                <Select value={newStep.resource_id || ''} onValueChange={v => setNewStep({ ...newStep, resource_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{resources.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Setup (min)</Label><Input type="number" value={newStep.setup_time_minutes || 0} onChange={e => setNewStep({ ...newStep, setup_time_minutes: toSafeNumber(e.target.value) })} /></div>
              <div className="space-y-1"><Label className="text-xs">Operação (min)</Label><Input type="number" value={newStep.operation_time_minutes || 0} onChange={e => setNewStep({ ...newStep, operation_time_minutes: toSafeNumber(e.target.value) })} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!selectableOperations.some(op => op.name === newStep.step_name)}>Adicionar</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : steps.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="Nenhuma etapa definida"
            description="Adicione a primeira etapa da rota (setor, recurso e tempos de setup/operação)."
            action={{ label: 'Adicionar Etapa', onClick: () => setShowAdd(true), icon: Plus }}
            compact
          />
        ) : (
          <div className="space-y-0">
            {steps.length > 1 && (
              <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2 px-1">
                {steps.map((s, i) => (
                  <div key={s.id} className="flex items-center shrink-0">
                    <div className="flex flex-col items-center">
                      <div className="h-9 px-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-1.5">
                        <span className="text-xs font-bold text-primary">{s.sequence}</span>
                        <span className="text-xs font-medium text-foreground whitespace-nowrap">{s.step_name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                        {(s.setup_time_minutes || 0) + (s.operation_time_minutes || 0)}min
                      </span>
                    </div>
                    {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-primary/40 shrink-0 mx-0.5" />}
                  </div>
                ))}
              </div>
            )}

            {steps.map((s, i) => (
              <div key={s.id}>
                <div className="relative flex items-stretch gap-3 group">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shadow-md ring-2 ring-primary/20">
                      {s.sequence}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-primary/40 to-border mt-1" />
                    )}
                  </div>

                  <div className="flex-1 border border-border/40 rounded-xl p-3 mb-2 bg-card/60 hover:border-primary/30 hover:bg-card/80 transition-all shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{s.step_name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {s.sector_name && <Badge variant="secondary" className="text-[10px] h-5 gap-1">{s.sector_name}</Badge>}
                          {s.resource_name && <Badge variant="outline" className="text-[10px] h-5 gap-1">{s.resource_name}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Timer className="h-3 w-3 text-amber-500" />
                            Setup: <span className="font-mono font-medium text-foreground">{s.setup_time_minutes}min</span>
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3 text-blue-500" />
                            Op: <span className="font-mono font-medium text-foreground">{s.operation_time_minutes}min</span>
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => removeStep(s.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
