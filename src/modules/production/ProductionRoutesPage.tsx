import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { useProductionRoutes, ProductionRouteRow } from '@/hooks/production/useProductionRoutes';
import { useProducts } from '@/hooks/inventory/useProducts';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Card, CardContent } from '@/ui/base/card';
import { Plus, Search, ChevronRight } from 'lucide-react';
import { emptyRoute } from './productionRoutes/constants';
import { RoutesKPIs } from './productionRoutes/RoutesKPIs';
import { RoutesList } from './productionRoutes/RoutesList';
import { RouteFormDialog, DeleteRouteDialog } from './productionRoutes/RouteFormDialog';
import { RouteStepsPanel } from './productionRoutes/RouteStepsPanel';

export default function ProductionRoutesPage() {
  const { routes, loading, create, update, remove } = useProductionRoutes();
  const { data: products = [] } = useProducts();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionRouteRow | null>(null);
  const [form, setForm] = useState<Partial<ProductionRouteRow>>(emptyRoute);
  const [search, setSearch] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = routes.filter(r =>
    r.code.toLowerCase().includes(search.toLowerCase()) ||
    (r.product_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const kpiValues = [
    routes.length,
    routes.filter(r => r.is_active).length,
    new Set(routes.map(r => r.product_id).filter(Boolean)).size,
    routes.length ? `${Math.round(routes.reduce((s, r) => s + r.total_time_minutes, 0) / routes.length)} min` : '0 min',
  ];

  const openNew = () => { setEditing(null); setForm(emptyRoute); setOpen(true); };
  const openEdit = (r: ProductionRouteRow) => { setEditing(r); setForm(r); setOpen(true); };
  const handleSave = async () => { const ok = editing ? await update(editing.id, form) : await create(form); if (ok) setOpen(false); };

  const handleDelete = async () => {
    if (deleteId) { const removed = await remove(deleteId); if (removed && selectedRoute === deleteId) setSelectedRoute(null); if (removed) setDeleteId(null); }
  };

  return (
    <PageContainer>
      <PageHeader title="Rotas Produtivas" description="Defina a sequência de etapas para fabricação de cada produto" />

      <RoutesKPIs values={kpiValues} />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar rota ou produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-2" />Nova Rota</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RoutesList
          loading={loading}
          routes={filtered}
          search={search}
          selectedRoute={selectedRoute}
          onSelect={setSelectedRoute}
          onEdit={openEdit}
          onDelete={setDeleteId}
          onClearSearch={() => setSearch('')}
          onNew={openNew}
        />

        <div className="lg:col-span-2">
          {selectedRoute ? (
            <RouteStepsPanel routeId={selectedRoute} onClose={() => setSelectedRoute(null)} />
          ) : (
            <Card className="border-border/40 border-dashed">
              <CardContent className="flex flex-col items-center py-24 text-muted-foreground">
                <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
                  <ChevronRight className="h-8 w-8 opacity-30" />
                </div>
                <p className="font-semibold text-base">Selecione uma rota</p>
                <p className="text-sm mt-1">Clique em uma rota à esquerda para ver e editar suas etapas</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <RouteFormDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        products={products}
        onSave={handleSave}
      />

      <DeleteRouteDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </PageContainer>
  );
}
