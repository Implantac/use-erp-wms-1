import { useState } from 'react';
import { EmptyState } from '@/shared/components/EmptyState';
import { ExportButton } from '@/shared/components/ExportButton';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Progress } from '@/ui/base/progress';
import { Search, Package, AlertTriangle, ClipboardList, DollarSign, ExternalLink } from 'lucide-react';
import { useWMSInventory } from '@/hooks/wms/useWMSInventory';
import { RealtimeStatus } from '@/modules/wms/components/RealtimeStatus';
import { Product360Drawer } from '@/modules/wms/components/Product360Drawer';
import { Button } from '@/ui/base/button';
import type { InventoryStatus } from '@/types/wms';


import { formatBRL, formatDate } from '@/lib/formatters';

export default function InventoryPage() {
  const { items, counts, loading } = useWMSInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [is360Open, setIs360Open] = useState(false);

  const handleOpen360 = (id: string) => {
    setSelectedProductId(id);
    setIs360Open(true);
  };

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

  const filteredItems = items.filter(item => {
    const matchesSearch =
      item.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalValue = items.reduce((sum, i) => sum + (i.quantity * i.value), 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const lowStockItems = items.filter(i => i.availableQty <= i.minStock).length;
  const expiredItems = items.filter(i => i.status === 'expired').length;

  return (
    <PageContainer loading={loading}>
      <PageHeader
        title="Inventário WMS"
        description="Controle de estoque, contagens e rastreabilidade"
        actions={
          <div className="flex items-center gap-2">
            <RealtimeStatus />
            <ExportButton
              data={filteredItems as unknown as Record<string, unknown>[]}
              columns={[
                { key: 'productCode', label: 'Código' },
                { key: 'productName', label: 'Produto' },
                { key: 'category', label: 'Categoria' },
                { key: 'location', label: 'Localização' },
                { key: 'quantity', label: 'Quantidade' },
                { key: 'availableQty', label: 'Disponível' },
                { key: 'value', label: 'Valor', format: (v) => formatBRL(Number(v)) },
                { key: 'status', label: 'Status' },
              ]}
              filename="inventario_wms"
            />
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Valor Total" value={formatBRL(totalValue)} description={`${totalItems} itens em estoque`} icon={DollarSign} index={0} />
        <KPICard title="Health Score" value={`${Math.round(100 - (lowStockItems / (items.length || 1) * 100))}%`} description="Disponibilidade Global" icon={Package} accentColor="success" index={1} />
        <KPICard title="Estoque Baixo" value={lowStockItems} description="Abaixo do mínimo" icon={AlertTriangle} index={2} accentColor={lowStockItems > 0 ? 'warning' : 'info'} />
        <KPICard title="Vencidos" value={expiredItems} description="Ação imediata" icon={AlertTriangle} index={3} accentColor={expiredItems > 0 ? 'danger' : 'info'} />
      </div>

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">Estoque</TabsTrigger>
          <TabsTrigger value="counts">Contagens ({counts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar por código ou nome..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  {/* QA-UX r13: filtros sem <label> visivel — nomes explicitos. */}
                  <SelectTrigger aria-label="Filtrar por categoria" className="w-full md:w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger aria-label="Filtrar por status do estoque" className="w-full md:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="available">Disponível</SelectItem>
                    <SelectItem value="reserved">Reservado</SelectItem>
                    <SelectItem value="damaged">Danificado</SelectItem>
                    <SelectItem value="expired">Vencido</SelectItem>
                    <SelectItem value="quarantine">Quarentena</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Itens em Estoque ({filteredItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Disponível</TableHead>
                    <TableHead>Sugestão IA</TableHead>
                    <TableHead>Cobertura</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0">
                        <EmptyState compact title="Nenhum item encontrado" description="Ajuste os filtros ou registre entradas de estoque." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map(item => {
                      const coverage = item.maxStock > 0 ? Math.round((item.quantity / item.maxStock) * 100) : 0;
                      return (
                        <TableRow key={item.id} className={item.availableQty <= item.minStock ? 'bg-destructive/5' : ''}>
                          <TableCell className="font-mono text-xs">{item.productCode}</TableCell>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell className="font-mono text-xs">{item.location}</TableCell>
                          <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                          <TableCell className="text-right font-semibold">{item.availableQty} {item.unit}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-accent">
                                {Math.max(0, Math.round(item.availableQty * 0.2))} {item.unit}
                              </span>
                              <Badge variant="outline" className="text-[8px] h-3 px-1 border-accent/20 text-accent scale-90 origin-left">Predição</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={Math.min(coverage, 100)} className="h-2 w-16" />
                              <span className="text-xs text-muted-foreground">{coverage}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={item.status} type="inventory" />
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => handleOpen360(item.id)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="counts" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Contagens de Inventário</CardTitle></CardHeader>
            <CardContent>
              {counts.length === 0 ? (
                <EmptyState title="Nenhuma contagem registrada" description="Programe contagens cíclicas ou gerais para manter a acurácia do inventário." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead>Data Agendada</TableHead>
                      <TableHead>Itens</TableHead>
                      <TableHead>Discrepâncias</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {counts.map(count => (
                      <TableRow key={count.id}>
                        <TableCell className="font-mono">{count.countNumber}</TableCell>
                        <TableCell>{count.zone || '-'}</TableCell>
                        <TableCell>{formatDate(count.scheduledDate)}</TableCell>
                        <TableCell>{count.itemsCount}</TableCell>
                        <TableCell className={count.discrepancies > 0 ? 'text-destructive font-medium' : ''}>{count.discrepancies}</TableCell>
                        <TableCell>{count.operator || '-'}</TableCell>
                        <TableCell>
                          <StatusBadge status={count.status} type="inventory" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Product360Drawer 
        open={is360Open} 
        onOpenChange={setIs360Open} 
        productId={selectedProductId} 
      />
    </PageContainer>
  );
}
