import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Factory, PackageSearch, ShieldCheck } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useProductionSchedule } from '@/hooks/production/useProductionSchedule';
import { TextileProcessMap } from './industrial/TextileProcessMap';

const links = [
  { href: '/vertical/spinning', title: 'Central PCP de Fiação', description: 'OP, reserva por lote de fibra/pluma, etapas, qualidade, conclusão e genealogia.', icon: Factory },
  { href: '/vertical/knitting', title: 'Central PCP de Malharia', description: 'OP, reserva por lote de fio, etapas, qualidade, conclusão e genealogia.', icon: Factory },
  { href: '/vertical/weaving', title: 'Central PCP de Tecelagem', description: 'OP, perfil do tear, reserva, etapas, eventos, qualidade e conclusão.', icon: Factory },
  { href: '/vertical/dyeing', title: 'Central PCP de Tinturaria', description: 'OP, ficha/receita configurada, reserva, etapas, qualidade, conclusão e genealogia.', icon: Factory },
  { href: '/vertical/finishing', title: 'Central PCP de Beneficiamento', description: 'OP, perfil da rama/acabamento, reserva, etapas, qualidade, conclusão e genealogia.', icon: Factory },
  { href: '/producao/mrp', title: 'MRP líquido', description: 'Déficit por BOM, saldo disponível, compras abertas e pedido em rascunho.', icon: PackageSearch },
  { href: '/producao/programacao', title: 'Programação finita', description: 'Janelas por tear/recurso sem dupla alocação.', icon: CalendarClock },
  { href: '/producao/qualidade', title: 'Qualidade e liberação', description: 'Inspeção aprovada, quarentena e bloqueio formal da conclusão.', icon: ShieldCheck },
];

export default function TextileDashboard() {
  const { orders, loading, loadError, hasCompany } = useProductionOrders();
  const { schedules } = useProductionSchedule();
  const active = orders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const weaving = orders.filter((order) => `${order.sector ?? ''} ${order.work_center ?? ''}`.toLowerCase().match(/tecel|tear|loom/));
  const overdue = active.filter((order) => order.due_date && new Date(order.due_date) < new Date());

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Dashboard Têxtil" description="Hub operacional com contagens reais de OPs e programação. Eficiência de tear, metros/hora e OEE só serão exibidos quando houver fonte de apontamento/medição suficiente." />
      {!hasCompany && <p role="alert" className="text-sm text-muted-foreground">Selecione uma empresa para consultar o dashboard têxtil.</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">Falha ao carregar OPs; indicadores não exibidos.</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard title="OPs ativas" value={active.length} icon={<Factory className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="OPs marcadas tecelagem/tear" value={weaving.length} icon={<Factory className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Janelas finitas ativas" value={schedules.filter((schedule) => ['scheduled', 'in_progress'].includes(schedule.status ?? '')).length} icon={<CalendarClock className="h-5 w-5" />} accentColor="success" index={2} />
        <KPICard title="OPs atrasadas" value={overdue.length} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" index={3} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {links.map((link) => (
          <Card key={link.href}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><link.icon className="h-5 w-5" /> {link.title}</CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <CardContent><Button asChild variant="outline"><Link to={link.href}>Abrir <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5" /> Critério de leitura</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Este hub não estima eficiência, produção por hora ou qualidade de primeira escolha. Esses indicadores dependem de eventos/paradas e inspeções persistidos por OP; enquanto a fonte estiver incompleta, a central de tecelagem mostra “sem dados suficientes” nas pendências de prontidão.
        </CardContent>
      </Card>
      <TextileProcessMap />
    </PageContainer>
  );
}
