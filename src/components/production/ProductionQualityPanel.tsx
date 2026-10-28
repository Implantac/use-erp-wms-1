import { useState } from 'react';
import { toast } from 'sonner';
import { ClipboardCheck, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { QualityInspection } from '@/hooks/production/useQualityInspections';
import { decideProductionQualityInspection } from '@/services/production/textilePcpService';
import { formatNumber } from '@/lib/formatters';

interface Props {
  order: ProductionOrderRow;
  inspections: QualityInspection[];
  /** Cria a inspeção (hook useQualityInspections da central) e recarrega. */
  onCreateInspection: (inspection: Partial<QualityInspection>) => Promise<boolean>;
  onChanged: () => Promise<void> | void;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberta', approved: 'Aprovada', rejected: 'Rejeitada', quarantine: 'Quarentena',
};

/**
 * Qualidade da OP DENTRO da central do setor: registrar inspeção e decidir
 * (aprovar/rejeitar/quarentena) sem sair da tela. A decisão formal continua
 * sendo a RPC decide_production_quality_inspection; a conclusão da OP exige
 * quantidade aprovada >= produzida (regra da transação de conclusão).
 */
export function ProductionQualityPanel({ order, inspections, onCreateInspection, onChanged }: Props) {
  const [inspector, setInspector] = useState('');
  const [approved, setApproved] = useState('');
  const [rejected, setRejected] = useState('');
  const [defectReason, setDefectReason] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [creating, setCreating] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const approvedTotal = inspections
    .filter((i) => i.status.toLowerCase() === 'approved')
    .reduce((sum, i) => sum + (Number(i.approved_quantity) || 0), 0);
  const canRegister = !['completed', 'cancelled'].includes(order.status);

  const handleCreate = async () => {
    const approvedQty = Number(approved || 0);
    const rejectedQty = Number(rejected || 0);
    if (!inspector.trim()) { toast.error('Informe o inspetor'); return; }
    if (!(approvedQty > 0) && !(rejectedQty > 0)) { toast.error('Informe a quantidade aprovada e/ou rejeitada'); return; }
    if (rejectedQty > 0 && !defectReason.trim()) { toast.error('Informe o motivo do defeito para a quantidade rejeitada'); return; }
    setCreating(true);
    try {
      const ok = await onCreateInspection({
        production_order_id: order.id,
        inspector,
        inspection_date: new Date().toISOString(),
        approved_quantity: approvedQty,
        rejected_quantity: rejectedQty,
        defect_reason: defectReason || null,
        severity,
        status: 'open',
      });
      if (ok) {
        setApproved(''); setRejected(''); setDefectReason('');
        await onChanged();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDecide = async (inspection: QualityInspection, status: 'approved' | 'rejected' | 'quarantine') => {
    setDecidingId(inspection.id);
    try {
      await decideProductionQualityInspection(inspection.id, status);
      toast.success(status === 'approved' ? 'Inspeção aprovada' : status === 'rejected' ? 'Inspeção rejeitada' : 'Inspeção em quarentena');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao decidir inspeção');
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Qualidade da OP — decisão formal</CardTitle>
        <CardDescription>
          Aprovado acumulado: <strong>{formatNumber(approvedTotal)} {order.unit}</strong> de {formatNumber(order.quantity)} planejados.
          A conclusão (entrada em estoque) exige aprovação formal de toda a quantidade produzida.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {inspections.length > 0 ? (
          <Table>
            <TableHeader><TableRow><TableHead>Inspetor</TableHead><TableHead className="text-right">Aprovada</TableHead><TableHead className="text-right">Rejeitada</TableHead><TableHead>Defeito</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {inspections.map((inspection) => (
                <TableRow key={inspection.id}>
                  <TableCell>{inspection.inspector}</TableCell>
                  <TableCell className="text-right">{formatNumber(inspection.approved_quantity)}</TableCell>
                  <TableCell className="text-right">{formatNumber(inspection.rejected_quantity)}</TableCell>
                  <TableCell>{inspection.defect_reason || '—'}</TableCell>
                  <TableCell><Badge variant={inspection.status === 'approved' ? 'default' : 'outline'}>{STATUS_LABEL[inspection.status] ?? inspection.status}</Badge></TableCell>
                  <TableCell>
                    {inspection.status === 'open' && canRegister ? (
                      <div className="flex gap-1">
                        <Button size="sm" disabled={decidingId === inspection.id} onClick={() => void handleDecide(inspection, 'approved')}><ShieldCheck className="mr-1 h-3.5 w-3.5" />Aprovar</Button>
                        <Button size="sm" variant="outline" disabled={decidingId === inspection.id} onClick={() => void handleDecide(inspection, 'quarantine')}><ShieldAlert className="mr-1 h-3.5 w-3.5" />Quarentena</Button>
                        <Button size="sm" variant="ghost" disabled={decidingId === inspection.id} onClick={() => void handleDecide(inspection, 'rejected')}><ShieldX className="mr-1 h-3.5 w-3.5" />Rejeitar</Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma inspeção registrada para esta OP. Registre a primeira abaixo — sem aprovação formal, a OP não pode ser concluída.</p>
        )}

        {canRegister ? (
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.2fr_.6fr_.6fr_1fr_.7fr_auto]">
            <div className="space-y-1"><Label>Inspetor</Label><Input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="Nome do inspetor" /></div>
            <div className="space-y-1"><Label>Aprovada ({order.unit})</Label><Input type="number" min="0" step="0.0001" value={approved} onChange={(e) => setApproved(e.target.value)} /></div>
            <div className="space-y-1"><Label>Rejeitada ({order.unit})</Label><Input type="number" min="0" step="0.0001" value={rejected} onChange={(e) => setRejected(e.target.value)} /></div>
            <div className="space-y-1"><Label>Motivo do defeito</Label><Input value={defectReason} onChange={(e) => setDefectReason(e.target.value)} placeholder="Obrigatório se houver rejeição" /></div>
            <div className="space-y-1">
              <Label>Severidade</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Menor</SelectItem>
                  <SelectItem value="major">Maior</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end"><Button onClick={() => void handleCreate()} disabled={creating}>{creating ? 'Registrando…' : 'Registrar inspeção'}</Button></div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
