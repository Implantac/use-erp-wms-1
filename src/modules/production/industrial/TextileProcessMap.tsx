import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { TEXTILE_STAGES, type TextileRoute } from '@/lib/textile/processModel';

const routes: readonly { id: TextileRoute; title: string }[] = [
  { id: 'spinning', title: 'Fibra → fio' },
  { id: 'woven', title: 'Fio → tecido plano' },
  { id: 'knit', title: 'Fio → malha' },
  { id: 'dye_finish', title: 'Tecido cru → acabado' },
];

/** A configuration/reference map, never a production status dashboard. */
export function TextileProcessMap() {
  return <section aria-label="Mapa de processo têxtil" className="space-y-3">
    <div>
      <h3 className="text-xl font-semibold">Mapa de processo para parametrização</h3>
      <p className="text-sm text-muted-foreground">Etapas de referência, não ordens executadas. A empresa deve aprovar variantes, máquinas, lotes, unidades, receitas e controles antes de operar. Tecido plano e malha são rotas paralelas, não etapas obrigatórias da mesma OP.</p>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      {routes.map(route => <Card key={route.id}>
        <CardHeader><CardTitle className="text-base">{route.title}</CardTitle></CardHeader>
        <CardContent><ol className="space-y-3">{TEXTILE_STAGES.filter(stage => stage.route === route.id).map(stage => <li key={stage.id} className="border-l-2 pl-3">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{stage.label}</span><Badge variant="outline">Configuração pendente</Badge></div>
          <p className="text-xs text-muted-foreground">Entrada: {stage.input} · saída: {stage.output}</p>
          <p className="text-xs text-muted-foreground">Portão: {stage.gate}</p>
        </li>)}</ol></CardContent>
      </Card>)}
    </div>
  </section>;
}
