import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  Factory,
  Handshake,
  PackageCheck,
  RefreshCw,
  Send,
  Store,
  Truck,
  Wallet,
  Workflow,
} from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Skeleton } from '@/ui/base/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/base/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/base/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/base/table';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import {
  managerTowerService,
  type CoverageRow,
  type ManagerSuggestion,
  type StoreSummaryRow,
} from '@/services/operational/store/managerTowerService';
import {
  consignmentService,
  type ConsignmentMovement,
  type ConsignmentNetworkRow,
  type ConsignmentShipment,
} from '@/services/operational/store/consignmentService';
import { createSupplyRequest } from '@/services/operational/store/supplyService';
import { coverageDaysText, coverageLabel, formatRuptureDate } from '@/lib/manager/coverageMath';

const money = (n: number): string =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qty = (n: number | null | undefined): string => Number(n || 0).toLocaleString('pt-BR');

const statusBadge: Record<string, { label: string; variant: 'destructive' | 'default' | 'secondary' | 'outline' }> = {
  critical: { label: 'Ruptura', variant: 'destructive' },
  attention: { label: 'Atenção', variant: 'default' },
  normal: { label: 'Saudável', variant: 'secondary' },
  excess: { label: 'Excesso', variant: 'outline' },
  no_data: { label: 'Sem giro', variant: 'outline' },
};

const movementLabels: Record<ConsignmentMovement['movement_type'], string> = {
  ENVIO: 'Envio',
  RECEBIMENTO: 'Recebimento',
  VENDA: 'Venda',
  PATROCINIO: 'Patrocínio',
  DEVOLUCAO: 'Devolução',
  TRANSFERENCIA_OUT: 'Transferência saída',
  TRANSFERENCIA_IN: 'Transferência entrada',
  LIQUIDACAO: 'Liquidação',
};

type ConsignAction = 'envio' | 'venda' | 'patrocinio' | 'transferencia' | 'devolucao' | 'liquidacao';

interface ConsignFormState {
  originBranch: string;
  destBranch: string;
  branch: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  notes: string;
  items: Array<{ product_id: string; quantity: string; unit_consignment_price: string; unit_retail_price: string }>;
}

const emptyForm: ConsignFormState = {
  originBranch: '',
  destBranch: '',
  branch: '',
  productId: '',
  quantity: '',
  unitPrice: '',
  amount: '',
  notes: '',
  items: [{ product_id: '', quantity: '', unit_consignment_price: '', unit_retail_price: '' }],
};

export default function ManagerTower() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('consolidado');
  const [coverageBranch, setCoverageBranch] = useState<string>('__all__');
  const [coverageStatus, setCoverageStatus] = useState<string>('__all__');
  const [action, setAction] = useState<ConsignAction | null>(null);
  const [form, setForm] = useState<ConsignFormState>(emptyForm);

  const branchesQuery = useQuery({
    queryKey: ['mt-branches', companyId],
    enabled: !!companyId,
    queryFn: () => managerTowerService.getBranches(companyId!),
  });

  const summaryQuery = useQuery({
    queryKey: ['mt-summary', companyId],
    enabled: !!companyId,
    queryFn: () => managerTowerService.getStoreSummaries(companyId!),
  });

  const coverageQuery = useQuery({
    queryKey: ['mt-coverage', companyId],
    enabled: !!companyId,
    queryFn: () => managerTowerService.getCoverageRows(companyId!),
  });

  const suggestionsQuery = useQuery({
    queryKey: ['mt-suggestions', companyId],
    enabled: !!companyId,
    queryFn: () => managerTowerService.getSuggestions(companyId!),
  });

  const consignQuery = useQuery({
    queryKey: ['mt-consignment', companyId],
    enabled: !!companyId,
    queryFn: () => consignmentService.getNetwork(),
  });

  const consignSuggestionsQuery = useQuery({
    queryKey: ['mt-consign-sug', companyId],
    enabled: !!companyId,
    queryFn: () => managerTowerService.getConsignmentTransferSuggestions(companyId!),
  });

  const shipmentsQuery = useQuery({
    queryKey: ['mt-shipments', companyId],
    enabled: !!companyId,
    queryFn: () => consignmentService.listShipments(30),
  });

  const movementsQuery = useQuery({
    queryKey: ['mt-movements', companyId],
    enabled: !!companyId,
    queryFn: () => consignmentService.listMovements(40),
  });

  const productsQuery = useQuery({
    queryKey: ['mt-products', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await (supabase as any)
        .from('products')
        .select('id, code, name')
        .eq('company_id', companyId!)
        .order('name')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; code: string; name: string }>;
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['mt-summary'] });
    queryClient.invalidateQueries({ queryKey: ['mt-coverage'] });
    queryClient.invalidateQueries({ queryKey: ['mt-suggestions'] });
    queryClient.invalidateQueries({ queryKey: ['mt-consignment'] });
    queryClient.invalidateQueries({ queryKey: ['mt-consign-sug'] });
    queryClient.invalidateQueries({ queryKey: ['mt-shipments'] });
    queryClient.invalidateQueries({ queryKey: ['mt-movements'] });
  };

  const createTransfer = useMutation({
    mutationFn: async (s: ManagerSuggestion) => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await (supabase as any).rpc('create_stock_transfer_request', {
        p_origin_unit_id: s.sourceBranchId,
        p_destination_unit_id: s.branchId,
        p_items: [{ product_id: s.productId, quantity: s.suggestedQty }],
        p_notes: `Torre do Gestor: ${s.actionLabel} — ${s.productName}`,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Transferência criada como SUGERIDA', {
        description: 'Aprove na fila de transferências para separar e expedir.',
      });
      invalidateAll();
    },
    onError: (e: unknown) => toast.error(`Falha ao criar transferência: ${e instanceof Error ? e.message : 'erro'}`),
  });

  const createSupply = useMutation({
    mutationFn: (s: ManagerSuggestion) => createSupplyRequest(s.branchId, s.productId, s.suggestedQty),
    onSuccess: () => {
      toast.success('Solicitação enviada à fábrica', {
        description: 'Ela aparece na Caixa de Entrada da Fábrica para decisão de origem.',
      });
      invalidateAll();
    },
    onError: (e: unknown) => toast.error(`Falha ao solicitar: ${e instanceof Error ? e.message : 'erro'}`),
  });

  const receiveShipment = useMutation({
    mutationFn: (id: string) => consignmentService.receiveShipment(id),
    onSuccess: () => {
      toast.success('Envio recebido — peças entraram no estoque e no consignado da loja.');
      invalidateAll();
    },
    onError: (e: unknown) => toast.error(`Falha ao receber: ${e instanceof Error ? e.message : 'erro'}`),
  });

  const consignTransfer = useMutation({
    mutationFn: (args: { from: string; to: string; productId: string; qty: number }) =>
      consignmentService.transferStock(args.from, args.to, args.productId, args.qty, 'Remanejo por giro (Torre do Gestor)'),
    onSuccess: () => {
      toast.success('Consignada transferida entre as lojas.');
      invalidateAll();
    },
    onError: (e: unknown) => toast.error(`Falha na transferência: ${e instanceof Error ? e.message : 'erro'}`),
  });

  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const stores = useMemo(() => branches.filter((b) => b.kind === 'STORE'), [branches]);
  const origins = useMemo(() => branches.filter((b) => b.kind !== 'STORE'), [branches]);
  const summaries = useMemo(() => summaryQuery.data ?? [], [summaryQuery.data]);
  const coverage = useMemo(() => coverageQuery.data ?? [], [coverageQuery.data]);
  const suggestions = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);
  const consignRows = useMemo(() => consignQuery.data ?? [], [consignQuery.data]);
  const shipments = useMemo(() => shipmentsQuery.data ?? [], [shipmentsQuery.data]);
  const movements = useMemo(() => movementsQuery.data ?? [], [movementsQuery.data]);
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '';

  const filteredCoverage = useMemo(() => {
    return coverage.filter((row) => {
      if (coverageBranch !== '__all__' && row.branchId !== coverageBranch) return false;
      if (coverageStatus !== '__all__' && row.coverage.status !== coverageStatus) return false;
      return true;
    });
  }, [coverage, coverageBranch, coverageStatus]);

  const kpis = useMemo(() => {
    const stockValue = summaries.reduce((s, r) => s + r.stockValue, 0);
    const consignedValue = summaries.reduce((s, r) => s + r.consignedValue, 0);
    const pending = summaries.reduce((s, r) => s + r.consignmentPending, 0);
    const ruptures = summaries.reduce((s, r) => s + r.ruptureCount, 0);
    return { stockValue, consignedValue, pending, ruptures };
  }, [summaries]);

  const consignKpis = useMemo(() => {
    const available = consignRows.reduce((s, r) => s + Number(r.qty_available || 0), 0);
    const value = consignRows.reduce((s, r) => s + Number(r.consigned_value || 0), 0);
    const pending = consignRows.reduce((s, r) => s + Math.max(0, Number(r.sold_value || 0) - Number(r.settled_value || 0)), 0);
    return { available, value, pending };
  }, [consignRows]);

  // ——— ações do diálogo de consignação ———
  const openAction = (a: ConsignAction) => {
    setForm(emptyForm);
    setAction(a);
  };

  const submitConsign = useMutation({
    mutationFn: async () => {
      if (action === 'envio') {
        const items = form.items
          .filter((i) => i.product_id && Number(i.quantity) > 0)
          .map((i) => ({
            product_id: i.product_id,
            quantity: Number(i.quantity),
            unit_consignment_price: Number(i.unit_consignment_price || 0),
            unit_retail_price: Number(i.unit_retail_price || 0),
          }));
        if (!form.originBranch || !form.destBranch || items.length === 0) {
          throw new Error('Selecione origem, destino e ao menos um item válido');
        }
        return consignmentService.createShipment(form.originBranch, form.destBranch, items, form.notes || undefined);
      }
      if (action === 'venda') {
        if (!form.branch || !form.productId || Number(form.quantity) <= 0) throw new Error('Loja, produto e quantidade são obrigatórios');
        return consignmentService.registerSale(
          form.branch,
          form.productId,
          Number(form.quantity),
          form.unitPrice ? Number(form.unitPrice) : undefined,
          form.notes || undefined,
        );
      }
      if (action === 'patrocinio') {
        if (!form.branch || !form.productId || Number(form.quantity) <= 0) throw new Error('Loja, produto e quantidade são obrigatórios');
        return consignmentService.registerSponsorship(form.branch, form.productId, Number(form.quantity), form.notes || undefined);
      }
      if (action === 'transferencia') {
        if (!form.branch || !form.destBranch || !form.productId || Number(form.quantity) <= 0) {
          throw new Error('Loja origem, destino, produto e quantidade são obrigatórios');
        }
        return consignmentService.transferStock(form.branch, form.destBranch, form.productId, Number(form.quantity), form.notes || undefined);
      }
      if (action === 'devolucao') {
        if (!form.branch || !form.destBranch || !form.productId || Number(form.quantity) <= 0) {
          throw new Error('Loja, destino (fábrica/CD), produto e quantidade são obrigatórios');
        }
        return consignmentService.returnStock(form.branch, form.destBranch, form.productId, Number(form.quantity), form.notes || undefined);
      }
      if (action === 'liquidacao') {
        if (!form.branch || Number(form.amount) <= 0) throw new Error('Loja e valor são obrigatórios');
        return consignmentService.settle(form.branch, Number(form.amount), form.notes || undefined);
      }
      throw new Error('Ação não reconhecida');
    },
    onSuccess: () => {
      const messages: Record<ConsignAction, string> = {
        envio: 'Envio em consignação criado — a loja precisa receber.',
        venda: 'Venda de consignada registrada (conta no giro e gera valor a liquidar).',
        patrocinio: 'Patrocínio registrado — custo absorvido pela fábrica.',
        transferencia: 'Peças consignadas transferidas entre as lojas.',
        devolucao: 'Devolução registrada — peças retornaram à fábrica/CD.',
        liquidacao: 'Liquidação registrada.',
      };
      toast.success(messages[action!]);
      setAction(null);
      invalidateAll();
    },
    onError: (e: unknown) => toast.error(`Falha: ${e instanceof Error ? e.message : 'erro inesperado'}`),
  });

  const consignBranchOptions = useMemo(() => {
    const ids = new Set(consignRows.map((r) => r.branch_id));
    return branches.filter((b) => ids.has(b.id));
  }, [consignRows, branches]);

  const consignProductsForBranch = useMemo(() => {
    if (!form.branch) return [];
    const ids = new Set(consignRows.filter((r) => r.branch_id === form.branch).map((r) => r.product_id));
    return products.filter((p) => ids.has(p.id));
  }, [consignRows, form.branch, products]);

  return (
    <PageContainer loading={summaryQuery.isLoading}>
      <div className="space-y-6 pb-10">
        <PageHeader
          title="Torre do Gestor de Lojas"
          description="Controle total da rede: estoque por loja e consolidado, cobertura até a ruptura, decisões de reposição e consignação fábrica ↔ lojas."
          icon={Workflow}
          actions={
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { summaryQuery.refetch(); coverageQuery.refetch(); suggestionsQuery.refetch(); consignQuery.refetch(); }}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="consolidado">Consolidado</TabsTrigger>
            <TabsTrigger value="cobertura">Cobertura & Ruptura</TabsTrigger>
            <TabsTrigger value="sugestoes">Reposições</TabsTrigger>
            <TabsTrigger value="consignado">Consignado</TabsTrigger>
          </TabsList>

          {/* ——————————— CONSOLIDADO ——————————— */}
          <TabsContent value="consolidado" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Estoque próprio (custo)</CardDescription>
                  <CardTitle className="text-xl">{money(kpis.stockValue)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Valor em consignação</CardDescription>
                  <CardTitle className="text-xl">{money(kpis.consignedValue)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>SKUs em ruptura</CardDescription>
                  <CardTitle className={`text-xl ${kpis.ruptures > 0 ? 'text-destructive' : ''}`}>{kpis.ruptures}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Consignado a liquidar</CardDescription>
                  <CardTitle className="text-xl">{money(kpis.pending)}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Store className="h-4 w-4" /> Posição por unidade</CardTitle>
                <CardDescription>Estoque próprio, rupturas, menor cobertura e consignação de cada loja — fábrica e CD aparecem como origem de abastecimento.</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryQuery.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Estoque próprio</TableHead>
                        <TableHead className="text-right">Rupturas</TableHead>
                        <TableHead className="text-right">Menor cobertura</TableHead>
                        <TableHead className="text-right">Consignado</TableHead>
                        <TableHead className="text-right">A liquidar</TableHead>
                        <TableHead className="text-right">Em trânsito</TableHead>
                        <TableHead className="text-right">Tarefas críticas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaries.map((row: StoreSummaryRow) => (
                        <TableRow key={row.branch.id}>
                          <TableCell className="font-medium">{row.branch.name}</TableCell>
                          <TableCell>
                            <Badge variant={row.branch.kind === 'STORE' ? 'default' : 'outline'}>
                              {row.branch.kind === 'FACTORY' ? 'Fábrica' : row.branch.kind === 'CD' ? 'CD' : 'Loja'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{money(row.stockValue)}</TableCell>
                          <TableCell className="text-right">
                            {row.ruptureCount > 0 ? (
                              <Badge variant="destructive">{row.ruptureCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{coverageDaysText(row.minCoverageDays)}</TableCell>
                          <TableCell className="text-right">{qty(row.consignedQty)} un</TableCell>
                          <TableCell className="text-right">{money(row.consignmentPending)}</TableCell>
                          <TableCell className="text-right">{row.inTransitCount}</TableCell>
                          <TableCell className="text-right">{row.openCriticalTasks}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ——————————— COBERTURA & RUPTURA ——————————— */}
          <TabsContent value="cobertura" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Cobertura até a ruptura — produto × loja</CardTitle>
                <CardDescription>
                  Demanda média diária real (30 dias) × saldo projetado. A data de ruptura mostra quando a loja fica sem mercadoria se o giro continuar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Select value={coverageBranch} onValueChange={setCoverageBranch}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Loja" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas as lojas</SelectItem>
                      {stores.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={coverageStatus} onValueChange={setCoverageStatus}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Situação" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      <SelectItem value="critical">Ruptura</SelectItem>
                      <SelectItem value="attention">Atenção</SelectItem>
                      <SelectItem value="normal">Saudável</SelectItem>
                      <SelectItem value="excess">Excesso</SelectItem>
                      <SelectItem value="no_data">Sem giro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {coverageQuery.isLoading ? (
                  <Skeleton className="h-60 w-full" />
                ) : filteredCoverage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item encontrado com estes filtros.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Loja</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Trânsito</TableHead>
                        <TableHead className="text-right">Giro/dia</TableHead>
                        <TableHead className="text-right">Cobertura</TableHead>
                        <TableHead className="text-right">Ruptura prevista</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCoverage.slice(0, 200).map((row: CoverageRow) => {
                        const badge = statusBadge[row.coverage.status] ?? statusBadge.no_data;
                        return (
                          <TableRow key={`${row.branchId}-${row.productId}`}>
                            <TableCell>
                              <div className="font-medium">{row.productName}</div>
                              <div className="text-xs text-muted-foreground">{row.productCode}</div>
                            </TableCell>
                            <TableCell>{row.branchName}</TableCell>
                            <TableCell className="text-right">{qty(row.coverage.available)}</TableCell>
                            <TableCell className="text-right">{qty(row.coverage.inTransit)}</TableCell>
                            <TableCell className="text-right">{row.coverage.dailyDemand.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium">{coverageDaysText(row.coverage.coverageDays)}</TableCell>
                            <TableCell className="text-right">{formatRuptureDate(row.coverage.ruptureDate)}</TableCell>
                            <TableCell>
                              <Badge variant={badge.variant}>{coverageLabel(row.coverage.status)}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                {filteredCoverage.length > 200 && (
                  <p className="text-xs text-muted-foreground">Mostrando 200 de {filteredCoverage.length} itens — refine os filtros.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ——————————— SUGESTÕES DE REPOSIÇÃO ——————————— */}
          <TabsContent value="sugestoes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Decisões de reposição</CardTitle>
                <CardDescription>
                  O sistema cruza ruptura × giro da rede e prescreve a melhor origem: remanejar de outra loja, deslocar do CD, pedir à fábrica ou produzir.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {suggestionsQuery.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma loja está em ruptura ou atenção agora — rede saudável. 🎉</p>
                ) : (
                  <div className="space-y-3">
                    {suggestions.slice(0, 40).map((s, idx) => (
                      <div key={`${s.branchId}-${s.productId}-${idx}`} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={s.urgency === 'critical' ? 'destructive' : 'default'}>
                                {s.urgency === 'critical' ? 'Crítico' : 'Atenção'}
                              </Badge>
                              <span className="font-semibold">{s.productName}</span>
                              <span className="text-xs text-muted-foreground">{s.productCode}</span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              <strong>{s.branchName}</strong> — {s.reason}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Origem sugerida: <strong>{s.actionLabel}</strong>
                              {s.sourceBranchName ? ` · ${s.sourceBranchName}` : ''} · sugerido {qty(s.suggestedQty)} un
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {s.action === 'REMANEJO' && s.sourceBranchId && (
                              <Button size="sm" onClick={() => createTransfer.mutate(s)} disabled={createTransfer.isPending}>
                                <ArrowRightLeft className="mr-1 h-4 w-4" /> Criar transferência
                              </Button>
                            )}
                            {(s.action === 'CD' || s.action === 'FABRICA') && (
                              <Button size="sm" onClick={() => createSupply.mutate(s)} disabled={createSupply.isPending}>
                                <Truck className="mr-1 h-4 w-4" /> Solicitar ao {s.action === 'CD' ? 'CD' : 'CD/fábrica'}
                              </Button>
                            )}
                            {s.action === 'PRODUCAO' && (
                              <Button size="sm" variant="outline" asChild>
                                <Link to="/compras/dashboard">
                                  <Factory className="mr-1 h-4 w-4" /> Abrir MRP / produzir
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ——————————— CONSIGNADO ——————————— */}
          <TabsContent value="consignado" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Peças em consignação (disp.)</CardDescription>
                  <CardTitle className="text-xl">{qty(consignKpis.available)} un</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Valor consignado nas lojas</CardDescription>
                  <CardTitle className="text-xl">{money(consignKpis.value)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>Vendido a liquidar</CardDescription>
                  <CardTitle className="text-xl">{money(consignKpis.pending)}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Handshake className="h-4 w-4" /> Operações de consignação</CardTitle>
                <CardDescription>
                  Envio da fábrica, recebimento na loja, venda, patrocínio, remanejo entre lojas, devolução e liquidação — tudo com rastro no ledger.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={() => openAction('envio')}><Send className="mr-1 h-4 w-4" /> Novo envio</Button>
                <Button variant="outline" onClick={() => openAction('venda')}><PackageCheck className="mr-1 h-4 w-4" /> Registrar venda</Button>
                <Button variant="outline" onClick={() => openAction('patrocinio')}><Handshake className="mr-1 h-4 w-4" /> Patrocínio</Button>
                <Button variant="outline" onClick={() => openAction('transferencia')}><ArrowRightLeft className="mr-1 h-4 w-4" /> Transferir entre lojas</Button>
                <Button variant="outline" onClick={() => openAction('devolucao')}><Truck className="mr-1 h-4 w-4" /> Devolver à fábrica</Button>
                <Button variant="outline" onClick={() => openAction('liquidacao')}><Wallet className="mr-1 h-4 w-4" /> Liquidar</Button>
              </CardContent>
            </Card>

            {consignSuggestionsQuery.data && consignSuggestionsQuery.data.length > 0 && (
              <Card className="border-primary/40">
                <CardHeader>
                  <CardTitle className="text-base">💡 Remanejo por giro sugerido</CardTitle>
                  <CardDescription>Peças paradas em loja de giro baixo que fazem falta em loja de giro alto.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {consignSuggestionsQuery.data.map((s, i) => (
                    <div key={`${s.fromBranchId}-${s.toBranchId}-${s.productId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                      <p className="text-sm">{s.reason}</p>
                      <Button
                        size="sm"
                        disabled={consignTransfer.isPending}
                        onClick={() => consignTransfer.mutate({ from: s.fromBranchId, to: s.toBranchId, productId: s.productId, qty: s.qty })}
                      >
                        Mover {qty(s.qty)} un
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Saldos por loja</CardTitle>
              </CardHeader>
              <CardContent>
                {consignQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : consignRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma peça em consignação ainda. Use “Novo envio” para começar.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Loja</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Disponível</TableHead>
                        <TableHead className="text-right">Vendido</TableHead>
                        <TableHead className="text-right">Patrocinado</TableHead>
                        <TableHead className="text-right">Devolvido</TableHead>
                        <TableHead className="text-right">Valor consignado</TableHead>
                        <TableHead className="text-right">A liquidar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consignRows.map((r: ConsignmentNetworkRow) => (
                        <TableRow key={`${r.branch_id}-${r.product_id}`}>
                          <TableCell>{r.branch_name}</TableCell>
                          <TableCell>
                            <div className="font-medium">{r.product_name}</div>
                            <div className="text-xs text-muted-foreground">{r.product_code}</div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{qty(r.qty_available)}</TableCell>
                          <TableCell className="text-right">{qty(r.qty_sold)}</TableCell>
                          <TableCell className="text-right">{qty(r.qty_sponsored)}</TableCell>
                          <TableCell className="text-right">{qty(r.qty_returned)}</TableCell>
                          <TableCell className="text-right">{money(Number(r.consigned_value))}</TableCell>
                          <TableCell className="text-right">
                            {Number(r.sold_value) - Number(r.settled_value) > 0 ? (
                              <span className="font-medium text-warning">{money(Number(r.sold_value) - Number(r.settled_value))}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Envios</CardTitle>
              </CardHeader>
              <CardContent>
                {shipments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Destino</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shipments.map((sh: ConsignmentShipment) => (
                        <TableRow key={sh.id}>
                          <TableCell>{branchName(sh.destination_branch_id)}</TableCell>
                          <TableCell>{branchName(sh.origin_branch_id)}</TableCell>
                          <TableCell>
                            <Badge variant={sh.status === 'EM_TRANSITO' ? 'default' : 'secondary'}>
                              {sh.status === 'EM_TRANSITO' ? 'Em trânsito' : sh.status === 'RECEBIDA' ? 'Recebida' : 'Cancelada'}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(sh.created_at).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="text-right">
                            {sh.status === 'EM_TRANSITO' && (
                              <Button size="sm" variant="outline" disabled={receiveShipment.isPending} onClick={() => receiveShipment.mutate(sh.id)}>
                                <PackageCheck className="mr-1 h-4 w-4" /> Receber
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Histórico de movimentações</CardTitle>
              </CardHeader>
              <CardContent>
                {movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem movimentações.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Loja</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m: ConsignmentMovement) => (
                        <TableRow key={m.id}>
                          <TableCell>{new Date(m.created_at).toLocaleString('pt-BR')}</TableCell>
                          <TableCell>
                            <Badge variant={m.movement_type === 'VENDA' ? 'default' : m.movement_type === 'PATROCINIO' ? 'outline' : 'secondary'}>
                              {movementLabels[m.movement_type]}
                            </Badge>
                          </TableCell>
                          <TableCell>{branchName(m.branch_id)}</TableCell>
                          <TableCell>{m.product_id ? productName(m.product_id) || '—' : '—'}</TableCell>
                          <TableCell className="text-right">{qty(m.quantity)}</TableCell>
                          <TableCell className="text-right">{money(Number(m.value))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ——————————— DIÁLOGO DE CONSIGNAÇÃO ——————————— */}
        <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {action === 'envio' && 'Novo envio em consignação'}
                {action === 'venda' && 'Registrar venda de consignada'}
                {action === 'patrocinio' && 'Registrar patrocínio'}
                {action === 'transferencia' && 'Transferir consignada entre lojas'}
                {action === 'devolucao' && 'Devolver consignada à fábrica/CD'}
                {action === 'liquidacao' && 'Liquidar consignação vendida'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {action === 'envio' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Origem (fábrica/CD)</Label>
                      <Select value={form.originBranch} onValueChange={(v) => setForm({ ...form, originBranch: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {origins.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Destino (loja)</Label>
                      <Select value={form.destBranch} onValueChange={(v) => setForm({ ...form, destBranch: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {stores.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Label>Itens</Label>
                  {form.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <div className="col-span-6">
                        <Select
                          value={item.product_id}
                          onValueChange={(v) => {
                            const items = [...form.items];
                            items[i] = { ...items[i], product_id: v };
                            setForm({ ...form, items });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number" min="1" placeholder="Qtd"
                          value={item.quantity}
                          onChange={(e) => {
                            const items = [...form.items];
                            items[i] = { ...items[i], quantity: e.target.value };
                            setForm({ ...form, items });
                          }}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number" min="0" step="0.01" placeholder="R$ consign."
                          value={item.unit_consignment_price}
                          onChange={(e) => {
                            const items = [...form.items];
                            items[i] = { ...items[i], unit_consignment_price: e.target.value };
                            setForm({ ...form, items });
                          }}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number" min="0" step="0.01" placeholder="R$ varejo"
                          value={item.unit_retail_price}
                          onChange={(e) => {
                            const items = [...form.items];
                            items[i] = { ...items[i], unit_retail_price: e.target.value };
                            setForm({ ...form, items });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setForm({ ...form, items: [...form.items, { product_id: '', quantity: '', unit_consignment_price: '', unit_retail_price: '' }] })}
                  >
                    + Adicionar item
                  </Button>
                </>
              )}

              {(action === 'venda' || action === 'patrocinio' || action === 'transferencia' || action === 'devolucao' || action === 'liquidacao') && (
                <div>
                  <Label>Loja</Label>
                  <Select value={form.branch} onValueChange={(v) => setForm({ ...form, branch: v, productId: '' })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar loja" /></SelectTrigger>
                    <SelectContent>
                      {(consignBranchOptions.length > 0 ? consignBranchOptions : stores).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(action === 'transferencia' || action === 'devolucao') && (
                <div>
                  <Label>{action === 'devolucao' ? 'Devolver para (fábrica/CD)' : 'Destino (loja)'}</Label>
                  <Select value={form.destBranch} onValueChange={(v) => setForm({ ...form, destBranch: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {(action === 'devolucao' ? origins : stores.filter((b) => b.id !== form.branch)).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(action === 'venda' || action === 'patrocinio' || action === 'transferencia' || action === 'devolucao') && (
                <div>
                  <Label>Produto (consignado na loja)</Label>
                  <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {(consignProductsForBranch.length > 0 ? consignProductsForBranch : products).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(action === 'venda' || action === 'patrocinio' || action === 'transferencia' || action === 'devolucao') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  </div>
                  {action === 'venda' && (
                    <div>
                      <Label>Preço de venda (opcional)</Label>
                      <Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
                    </div>
                  )}
                </div>
              )}

              {action === 'liquidacao' && (
                <div>
                  <Label>Valor a liquidar (R$)</Label>
                  <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              )}

              <div>
                <Label>Observação (opcional)</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAction(null)}>Cancelar</Button>
              <Button onClick={() => submitConsign.mutate()} disabled={submitConsign.isPending}>
                {submitConsign.isPending ? 'Processando…' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
