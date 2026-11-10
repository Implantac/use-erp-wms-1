import { Search, Factory, PackageX, Truck, AlertTriangle, TrendingUp, Layers, Star } from 'lucide-react';
import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { KPICard } from '@/shared/components/KPICard';
import { formatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { KANBAN_COLUMNS } from './constants';

type WipMetrics = {
  totalOrders: number;
  totalQty: number;
  totalCost: number;
  byColumn: Record<string, { count: number; qty: number; cost: number }>;
};

type Suggestion = { icon: string; text: string; severity: 'critical' | 'warning' | 'info' };

interface KanbanKPIsProps {
  inProgressCount: number;
  waitingMaterialCount: number;
  outsourcedCount: number;
  lateCount: number;
  completedToday: number;
}

export function KanbanKPIs({ inProgressCount, waitingMaterialCount, outsourcedCount, lateCount, completedToday }: KanbanKPIsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KPICard title="Em Produção" value={inProgressCount} icon={<Factory className="h-5 w-5" />} accentColor="primary" index={0} />
      <KPICard title="Aguardando Material" value={waitingMaterialCount} icon={<PackageX className="h-5 w-5" />} accentColor="warning" index={1} />
      <KPICard title="Terceirizado" value={outsourcedCount} icon={<Truck className="h-5 w-5" />} accentColor="info" index={2} />
      <KPICard title="Atrasadas" value={lateCount} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" index={3} />
      <KPICard title="Concluídas Hoje" value={completedToday} icon={<TrendingUp className="h-5 w-5" />} accentColor="success" index={4} />
    </div>
  );
}

export function KanbanWipPanel({ wipMetrics }: { wipMetrics: WipMetrics }) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">WIP — Material em Processo</span>
          <Badge variant="outline" className="ml-auto text-[10px]">{wipMetrics.totalOrders} OPs</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-lg font-bold text-primary">{formatNumber(wipMetrics.totalQty)}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Unidades em Processo</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-400">R$ {formatNumber(wipMetrics.totalCost, 0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Custo Estimado WIP</p>
          </div>
          {Object.entries(wipMetrics.byColumn).slice(0, 2).map(([status, data]) => {
            const label = KANBAN_COLUMNS.find(c => c.key === status)?.label || status;
            return (
              <div key={status} className="text-center">
                <p className="text-lg font-bold text-foreground">{data.count}</p>
                <p className="text-[10px] text-muted-foreground uppercase truncate">{label}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function KanbanSuggestions({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) return null;
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-warning-text" />
          <span className="text-sm font-medium">Sugestões Inteligentes</span>
        </div>
        <div className="space-y-1">
          {suggestions.map((s, i) => (
            <p key={i} className={cn(
              'text-xs',
              s.severity === 'critical' ? 'text-destructive font-medium'
                : s.severity === 'warning' ? 'text-warning-text' : 'text-muted-foreground'
            )}>
              {s.icon} {s.text}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface KanbanFiltersProps {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  sectorFilter: string;
  setSectorFilter: (v: string) => void;
  priorityFilter: string;
  setPriorityFilter: (v: string) => void;
  sectors: (string | null)[];
}

export function KanbanFilters({ searchTerm, setSearchTerm, sectorFilter, setSectorFilter, priorityFilter, setPriorityFilter, sectors }: KanbanFiltersProps) {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar OP, produto ou cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
          </div>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Setor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Setores</SelectItem>
              {sectors.map(s => <SelectItem key={s!} value={s!}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="urgent">🔴 Urgente</SelectItem>
              <SelectItem value="high">🟠 Alta</SelectItem>
              <SelectItem value="medium">🔵 Média</SelectItem>
              <SelectItem value="low">⚪ Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
