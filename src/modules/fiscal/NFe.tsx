import { useState } from 'react';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/lib/formatters';
import { Plus, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { ExportButton } from '@/shared/components/ExportButton';
import { Button } from '@/ui/base/button';
import { useFiscal } from '@/hooks/fiscal/useFiscal';
import { CreateNFeDialog } from '@/components/fiscal/CreateNFeDialog';
import { generateDANFE } from '@/lib/fiscalDocuments';
import type { NFe } from '@/types/fiscal';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { NFeFilters } from './nfe/NFeFilters';
import { NFeTable } from './nfe/NFeTable';
import { NFeDetailsDialog } from './nfe/NFeDetailsDialog';
import { CancelNFeDialog } from './nfe/CancelNFeDialog';

export default function NFePage() {
  const { nfes, transmitNFe: transmit, cancelNFe: cancel } = useFiscal();
  const create = async (_data: unknown): Promise<never> => {
    throw new Error('Criação de NF-e indisponível: falta validar leiaute IBS/CBS e integrar autorização oficial.');
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedNFe, setSelectedNFe] = useState<NFe | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [nfeToCancel, setNfeToCancel] = useState<NFe | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filteredNFes = nfes.filter((nfe) => {
    const matchesSearch =
      nfe.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      nfe.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      nfe.accessKey.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || nfe.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (v: number) => formatBRL(v);
  const formatDate = (s: string) => format(new Date(s), 'dd/MM/yyyy HH:mm', { locale: ptBR });

  const handleTransmit = async (nfe: NFe) => {
    if (nfe.status === 'pending') await transmit(nfe.id);
    else toastError('Transmissão de NF-e indisponível para este status.');
  };

  const handleCancel = (nfe: NFe) => {
    setNfeToCancel(nfe);
    setCancelReason('');
    setCancelDialogOpen(true);
  };

  const confirmCancel = async () => {
    if (!nfeToCancel || !cancelReason.trim()) return;
    await cancel({ id: nfeToCancel.id, reason: cancelReason });
    setCancelDialogOpen(false);
    setNfeToCancel(null);
  };

  const handlePrint = async (nfe: NFe) => {
    await generateDANFE(nfe);
    toastSuccess('DANFE Gerado', `PDF da DANFE ${nfe.number} baixado com sucesso`);
  };

  const handleDownloadXML = (nfe: NFe) => {
    void nfe;
    toastError('XML oficial indisponível. Não é permitido fabricar o arquivo a partir de dados de tela.');
  };

  return (
    <PageContainer>
      <PageHeader title="NF-e - Nota Fiscal Eletrônica" description="Gerencie suas notas fiscais eletrônicas">
        <ExportButton
          data={filteredNFes as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'number', label: 'Número' },
            { key: 'series', label: 'Série' },
            { key: 'clientName', label: 'Destinatário' },
            { key: 'totalValue', label: 'Valor', format: (v) => formatBRL(Number(v)) },
            { key: 'status', label: 'Status' },
            { key: 'issuedAt', label: 'Emissão', format: (v) => formatDate(v as string) },
          ]}
          filename="nfe"
        />
        <Button className="gap-2" disabled title="Criação indisponível até homologação fiscal e leiaute IBS/CBS" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />Nova NF-e
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="NF-e Emitidas" value={String(nfes.filter(n => n.status === 'authorized').length)} icon={<FileText className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Total Faturado" value={formatCurrency(nfes.filter(n => n.status === 'authorized').reduce((s, n) => s + n.total, 0))} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={1} />
        <KPICard title="Canceladas" value={String(nfes.filter(n => n.status === 'cancelled').length)} icon={<XCircle className="h-5 w-5" />} accentColor="danger" index={2} />
        <KPICard title="Total Impostos" value={formatCurrency(nfes.reduce((s, n) => s + n.icms + n.ipi + n.pis + n.cofins, 0))} icon={<AlertTriangle className="h-5 w-5" />} accentColor="warning" index={3} />
      </div>

      <NFeFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      <NFeTable
        rows={filteredNFes}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        onView={(n) => { setSelectedNFe(n); setDetailsOpen(true); }}
        onTransmit={handleTransmit}
        onPrint={handlePrint}
        onDownloadXML={handleDownloadXML}
        onCancel={handleCancel}
      />

      <NFeDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        nfe={selectedNFe}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        onPrint={handlePrint}
        onDownloadXML={handleDownloadXML}
      />

      <CancelNFeDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        nfe={nfeToCancel}
        reason={cancelReason}
        setReason={setCancelReason}
        onConfirm={confirmCancel}
      />

      <CreateNFeDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={create} />
    </PageContainer>
  );
}
