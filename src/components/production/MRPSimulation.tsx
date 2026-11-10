import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Slider } from '@/ui/base/slider';
import { SimulationService, SimulationScenario, SimulationResult, MRPService, ActionSuggestion } from '@/lib/pcpServices';
import { FlaskConical, AlertTriangle, TrendingDown, TrendingUp, Lightbulb, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderLike, SheetLike, SupplyLike, CapacityLike } from '@/lib/pcp/types';

import { formatNumber } from '@/lib/formatters';
interface MRPSimulationProps {
  orders: OrderLike[];
  sheets: SheetLike[];
  supplies: SupplyLike[];
  capacities: CapacityLike[];
}

export default function MRPSimulation({ orders, sheets, supplies, capacities }: MRPSimulationProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customShortage, setCustomShortage] = useState(50);
  const [customCapacityChange, setCustomCapacityChange] = useState(-30);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const presets = useMemo(() => SimulationService.presetScenarios(orders, supplies, capacities), [orders, supplies, capacities]);

  const runSimulation = () => {
    setIsRunning(true);
    setTimeout(() => {
      let scenario: SimulationScenario;
      const preset = presets.find(p => p.name === selectedPreset);

      if (preset) {
        scenario = preset;
      } else {
        // Custom scenario
        const sectors = [...new Set(capacities.map((c) => c.sector))];
        scenario = {
          name: 'Cenário Personalizado',
          description: `Redução ${customShortage}% material + ${customCapacityChange}% capacidade`,
          materialShortages: supplies.slice(0, 3).map((s) => ({ materialCode: s.code || s.name, reducePct: customShortage })),
          capacityChange: sectors.map(s => ({ sector: s, changePct: customCapacityChange })),
        };
      }

      const simResult = SimulationService.simulate(scenario, orders, sheets, supplies, capacities);
      setResult(simResult);
      setIsRunning(false);
    }, 500);
  };

  const reset = () => {
    setResult(null);
    setSelectedPreset('');
  };

  const severityIcon = (severity: string) => {
    if (severity === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-warning-text" />;
    return <Lightbulb className="h-4 w-4 text-primary" />;
  };

  return (
    <div className="space-y-4">
      {/* Scenario selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-5 w-5" /> Simulação What-If
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Simule cenários de risco sem afetar dados reais. Veja o impacto antes de tomar decisões.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Preset scenarios */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Cenários pré-definidos</label>
              <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                <SelectTrigger><SelectValue placeholder="Selecionar cenário..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">📐 Personalizado</SelectItem>
                  {presets.map(p => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset && selectedPreset !== 'custom' && (
                <p className="text-xs text-muted-foreground">
                  {presets.find(p => p.name === selectedPreset)?.description}
                </p>
              )}
            </div>

            {/* Custom parameters */}
            {(!selectedPreset || selectedPreset === 'custom') && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Redução de estoque: {customShortage}%</label>
                  <Slider value={[customShortage]} onValueChange={v => setCustomShortage(v[0])} min={0} max={100} step={10} className="mt-2" />
                </div>
                <div>
                  <label className="text-sm font-medium">Variação de capacidade: {customCapacityChange > 0 ? '+' : ''}{customCapacityChange}%</label>
                  <Slider value={[customCapacityChange]} onValueChange={v => setCustomCapacityChange(v[0])} min={-50} max={50} step={10} className="mt-2" />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={runSimulation} disabled={isRunning}>
              <Play className="h-4 w-4 mr-2" /> {isRunning ? 'Calculando...' : 'Executar Simulação'}
            </Button>
            {result && (
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-2" /> Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <Card className={cn(result.kpis.delayRate > 30 && 'border-destructive/40')}>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Taxa de Atraso Simulada</p>
                <p className={cn('text-3xl font-extrabold', result.kpis.delayRate > 30 ? 'text-destructive' : 'text-foreground')}>
                  {result.kpis.delayRate.toFixed(0)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Variação Média Lead Time</p>
                <p className="text-3xl font-extrabold flex items-center justify-center gap-1">
                  {result.kpis.avgLeadTimeChange > 0 ? <TrendingDown className="h-5 w-5 text-destructive" /> : <TrendingUp className="h-5 w-5 text-success" />}
                  {result.kpis.avgLeadTimeChange > 0 ? '+' : ''}{result.kpis.avgLeadTimeChange.toFixed(1)}d
                </p>
              </CardContent>
            </Card>
            <Card className={cn(result.kpis.criticalOPs > 0 && 'border-warning/40')}>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">OPs Críticas</p>
                <p className={cn('text-3xl font-extrabold', result.kpis.criticalOPs > 0 ? 'text-warning-text' : 'text-success')}>
                  {result.kpis.criticalOPs}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Summary */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium">{result.impactSummary}</p>
            </CardContent>
          </Card>

          {/* Affected OPs */}
          {result.affectedOPs.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">OPs Impactadas</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>OP</TableHead>
                    <TableHead>Prazo Original</TableHead>
                    <TableHead>Nova Estimativa</TableHead>
                    <TableHead className="text-right">Impacto (dias)</TableHead>
                    <TableHead>Risco</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {result.affectedOPs.slice(0, 15).map(o => (
                      <TableRow key={o.opNumber} className={cn(o.risk === 'high' && 'bg-destructive/5')}>
                        <TableCell className="font-mono">{o.opNumber}</TableCell>
                        <TableCell>{o.originalDue}</TableCell>
                        <TableCell>{o.newEstimate}</TableCell>
                        <TableCell className={cn('text-right font-bold', o.daysImpact > 0 ? 'text-destructive' : 'text-success')}>
                          {o.daysImpact > 0 ? '+' : ''}{o.daysImpact}
                        </TableCell>
                        <TableCell>
                          <Badge variant={o.risk === 'high' ? 'destructive' : o.risk === 'medium' ? 'secondary' : 'outline'}>
                            {o.risk === 'high' ? 'Alto' : o.risk === 'medium' ? 'Médio' : 'Baixo'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Material impact */}
          {result.materialImpact.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Impacto nos Materiais</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Déficit Original</TableHead>
                    <TableHead className="text-right">Novo Déficit</TableHead>
                    <TableHead className="text-right">Variação</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {result.materialImpact.map(m => (
                      <TableRow key={m.materialName}>
                        <TableCell className="font-medium">{m.materialName}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(m.originalDeficit)}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(m.newDeficit)}</TableCell>
                        <TableCell className={cn('text-right font-bold', m.change > 0 ? 'text-destructive' : 'text-success')}>
                          {m.change > 0 ? '+' : ''}{formatNumber(m.change)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Smart suggestions */}
          {result.suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" /> Sugestões de Ação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.suggestions.slice(0, 8).map((s, i) => (
                    <div key={i} className={cn(
                      'p-3 rounded-lg border',
                      s.severity === 'critical' ? 'bg-destructive/5 border-destructive/30' :
                        s.severity === 'warning' ? 'bg-warning/5 border-warning/30' : 'bg-primary/5 border-primary/30'
                    )}>
                      <div className="flex items-start gap-2">
                        {severityIcon(s.severity)}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{s.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                          {s.estimatedImpact && (
                            <p className="text-xs font-medium mt-1">Impacto: {s.estimatedImpact}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{s.type}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
