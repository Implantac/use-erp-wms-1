import { useState, useMemo } from 'react';
import { toastError } from '@/lib/toastHelpers';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { PageLoading } from '@/shared/components/PageLoading';
import { KPICard } from '@/shared/components/KPICard';
import { ExportButton } from '@/shared/components/ExportButton';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/ui/base/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/base/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/base/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Progress } from '@/ui/base/progress';
import { Plus, MoreHorizontal, Pencil, Trash2, Users, Target, DollarSign, TrendingUp, Briefcase } from 'lucide-react';
import { useSalesReps, useCreateSalesRep, useUpdateSalesRep, useDeleteSalesRep, type DbSalesRep } from '@/hooks/commercial/useSalesReps';
import { useClients } from '@/hooks/commercial/useClients';
import { useOrders } from '@/hooks/commercial/useOrders';
import { Badge } from '@/ui/base/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { formatBRL } from '@/lib/formatters';

export default function SalesRepsPage() {
  const { data: reps = [], isLoading } = useSalesReps();
  const { data: clients = [] } = useClients();
  const { data: orders = [] } = useOrders();
  const createRep = useCreateSalesRep();
  const updateRep = useUpdateSalesRep();
  const deleteRep = useDeleteSalesRep();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<DbSalesRep | null>(null);
  const [formData, setFormData] = useState({
    name: '', code: '', email: '', phone: '', region: '', micro_region: '',
    commission_rate: '5', monthly_target: '0', status: 'active',
  });

  // Portfolio analysis
  const portfolioData = useMemo(() => {
    const repPortfolios = reps.map(rep => {
      const repClients = clients.filter(c => c.sales_rep_id === rep.id);
      const repOrders = orders.filter(o => o.sales_rep_id === rep.id && o.status !== 'cancelled');
      const monthlyRevenue = repOrders.reduce((s, o) => s + o.total, 0);
      const conversionRate = repOrders.length > 0 ? (repOrders.filter(o => o.status === 'delivered').length / repOrders.length) * 100 : 0;
      const activeClients = repClients.filter(c => c.status === 'active').length;
      const targetPct = rep.monthly_target > 0 ? (monthlyRevenue / rep.monthly_target) * 100 : 0;

      return {
        ...rep,
        clientCount: repClients.length,
        activeClients,
        orderCount: repOrders.length,
        revenue: monthlyRevenue,
        conversionRate,
        targetPct,
      };
    });

    const unassigned = clients.filter(c => !c.sales_rep_id || !reps.some(r => r.id === c.sales_rep_id));

    const rankingData = repPortfolios
      .filter(r => r.status === 'active')
      .sort((a, b) => b.revenue - a.revenue)
      .map(r => ({ name: r.name, revenue: r.revenue, meta: r.monthly_target }));

    return { repPortfolios, unassigned, rankingData };
  }, [reps, clients, orders]);

  const resetForm = () => {
    setFormData({ name: '', code: '', email: '', phone: '', region: '', micro_region: '', commission_rate: '5', monthly_target: '0', status: 'active' });
    setSelected(null);
  };

  const openEdit = (rep: DbSalesRep) => {
    setSelected(rep);
    setFormData({
      name: rep.name, code: rep.code, email: rep.email || '', phone: rep.phone || '',
      region: rep.region || '', micro_region: rep.micro_region || '',
      commission_rate: rep.commission_rate.toString(), monthly_target: rep.monthly_target.toString(),
      status: rep.status,
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) return toastError('Nome e código obrigatórios');
    const payload = {
      name: formData.name, code: formData.code, email: formData.email || null,
      phone: formData.phone || null, region: formData.region || null,
      micro_region: formData.micro_region || null,
      commission_rate: parseFloat(formData.commission_rate) || 5,
      monthly_target: parseFloat(formData.monthly_target) || 0,
      status: formData.status,
    };
    if (selected) {
      await updateRep.mutateAsync({ id: selected.id, ...payload });
    } else {
      await createRep.mutateAsync(payload);
    }
    setIsFormOpen(false);
    resetForm();
  };

  const handleDelete = async () => {
    if (selected) await deleteRep.mutateAsync(selected.id);
    setIsDeleteOpen(false);
    setSelected(null);
  };

  const totalTarget = reps.reduce((s, r) => s + r.monthly_target, 0);
  const totalRevenue = portfolioData.repPortfolios.reduce((s, r) => s + r.revenue, 0);
  const activeReps = reps.filter(r => r.status === 'active').length;

  const columns: Column<DbSalesRep>[] = [
    { key: 'code', label: 'Código', sortable: true },
    { key: 'name', label: 'Nome', sortable: true },
    { key: 'region', label: 'Região', render: (_v, r) => (
      <div>
        <p className="text-sm">{r.region || '—'}</p>
        {r.micro_region && <p className="text-[10px] text-muted-foreground">{r.micro_region}</p>}
      </div>
    )},
    { key: 'commission_rate', label: 'Comissão', render: (_v, r) => `${r.commission_rate}%` },
    { key: 'monthly_target', label: 'Meta Mensal', render: (_v, r) => formatBRL(r.monthly_target) },
    { key: 'total_sales', label: 'Vendas Total', render: (_v, r) => {
      const portfolio = portfolioData.repPortfolios.find(p => p.id === r.id);
      return (
        <div>
          <p className="font-semibold">{formatBRL(portfolio?.revenue || 0)}</p>
          <p className="text-[10px] text-muted-foreground">{portfolio?.clientCount || 0} clientes</p>
        </div>
      );
    }},
    { key: 'status', label: 'Status', render: (_v, r) => (
      <Badge variant={r.status === 'active' ? 'default' : 'secondary'}>
        {r.status === 'active' ? 'Ativo' : 'Inativo'}
      </Badge>
    )},
  ];

  const renderActions = (_v: unknown, r: DbSalesRep) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => openEdit(r)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => { setSelected(r); setIsDeleteOpen(true); }}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) return <PageLoading />;

  return (
    <PageContainer>
      <PageHeader title="Representantes Comerciais" description="Gestão de equipe, carteira e performance">
        <ExportButton data={reps as unknown as Record<string, unknown>[]} columns={[
          { key: 'code', label: 'Código' }, { key: 'name', label: 'Nome' },
          { key: 'region', label: 'Região' }, { key: 'commission_rate', label: 'Comissão %' },
          { key: 'monthly_target', label: 'Meta Mensal' }, { key: 'status', label: 'Status' },
        ]} filename="representantes" />
        <Button onClick={() => { resetForm(); setIsFormOpen(true); }} size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Representante</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-5 mb-6 mt-6">
        <KPICard index={0} title="Representantes" value={reps.length.toString()} subtitle={`${activeReps} ativos`} icon={<Users className="h-5 w-5" />} accentColor="primary" />
        <KPICard index={1} title="Meta Total Mês" value={formatBRL(totalTarget)} icon={<Target className="h-5 w-5" />} accentColor="info" />
        <KPICard index={2} title="Faturamento Total" value={formatBRL(totalRevenue)} icon={<DollarSign className="h-5 w-5" />} accentColor="success" />
        <KPICard index={3} title="Atingimento" value={`${totalTarget > 0 ? ((totalRevenue / totalTarget) * 100).toFixed(0) : 0}%`} icon={<TrendingUp className="h-5 w-5" />} accentColor="accent" />
        <KPICard index={4} title="Sem Representante" value={portfolioData.unassigned.length.toString()} icon={<Briefcase className="h-5 w-5" />} accentColor="warning" />
      </div>

      <Tabs defaultValue="list" className="mb-6">
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="portfolio">Carteira</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <DataTable columns={columns} data={reps} searchPlaceholder="Buscar representante..." actions={(r) => renderActions(null, r)} />
        </TabsContent>

        <TabsContent value="ranking">
          <Card>
            <CardHeader><CardTitle className="text-sm">Ranking de Vendas — Representantes Ativos</CardTitle></CardHeader>
            <CardContent>
              {portfolioData.rankingData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, portfolioData.rankingData.length * 50)}>
                  <BarChart data={portfolioData.rankingData} layout="vertical">
                    <XAxis type="number" tickFormatter={v => formatBRL(v)} fontSize={11} />
                    <YAxis type="category" dataKey="name" width={140} fontSize={12} />
                    <Tooltip formatter={(v: number) => formatBRL(v)} />
                    <Bar dataKey="revenue" name="Faturamento" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="meta" name="Meta" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} opacity={0.3} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-10">Sem dados</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {portfolioData.repPortfolios.filter(r => r.status === 'active').map(rep => (
              <Card key={rep.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{rep.name}</p>
                      <p className="text-xs text-muted-foreground">{rep.region || 'Sem região'}{rep.micro_region ? ` • ${rep.micro_region}` : ''}</p>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">{rep.code}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground">Clientes</p>
                      <p className="font-semibold">{rep.clientCount} <span className="text-xs font-normal text-muted-foreground">({rep.activeClients} ativos)</span></p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground">Pedidos</p>
                      <p className="font-semibold">{rep.orderCount}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground">Faturamento</p>
                      <p className="font-semibold text-primary">{formatBRL(rep.revenue)}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground">Conversão</p>
                      <p className="font-semibold">{rep.conversionRate.toFixed(0)}%</p>
                    </div>
                  </div>
                  {rep.monthly_target > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Meta: {formatBRL(rep.monthly_target)}</span>
                        <span className="font-medium">{rep.targetPct.toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min(rep.targetPct, 100)} className="h-1.5" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {portfolioData.unassigned.length > 0 && (
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-warning-text" />
                    <p className="font-semibold text-warning-text">Sem Representante</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{portfolioData.unassigned.length} clientes sem responsável</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {portfolioData.unassigned.slice(0, 10).map(c => (
                      <p key={c.id} className="text-xs truncate">{c.name} <span className="text-muted-foreground">• {c.address_city}/{c.address_state}</span></p>
                    ))}
                    {portfolioData.unassigned.length > 10 && <p className="text-xs text-muted-foreground">+{portfolioData.unassigned.length - 10} mais...</p>}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? 'Editar Representante' : 'Novo Representante'}</DialogTitle>
            <DialogDescription>Dados do representante comercial</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome *</Label><Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Código *</Label><Input value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>Telefone</Label><Input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Região</Label><Input value={formData.region} onChange={e => setFormData(p => ({ ...p, region: e.target.value }))} /></div>
              <div><Label>Micro-Região</Label><Input value={formData.micro_region} onChange={e => setFormData(p => ({ ...p, micro_region: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Comissão (%)</Label><Input type="number" value={formData.commission_rate} onChange={e => setFormData(p => ({ ...p, commission_rate: e.target.value }))} /></div>
              <div><Label>Meta Mensal (R$)</Label><Input type="number" value={formData.monthly_target} onChange={e => setFormData(p => ({ ...p, monthly_target: e.target.value }))} /></div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createRep.isPending || updateRep.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir representante?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
