import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Eye, MoreHorizontal, Loader2 } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { PageLoading } from '@/shared/components/PageLoading';
import { ExportButton } from '@/shared/components/ExportButton';
import { Button } from '@/ui/base/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/base/dropdown-menu';
import { formatBRL } from '@/lib/formatters';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/ui/base/alert-dialog';
import { DataTable } from '@/shared/components/DataTable';
import { useClients, useDeleteClient, type DbClient } from '@/hooks/commercial/useClients';
import { ClientDetailDialog } from '@/components/commercial/ClientDetailDialog';
import { ClientFormDialog } from '@/components/commercial/ClientFormDialog';
import { ClientStats } from '@/components/commercial/ClientStats';
import { ClientFilters } from '@/components/commercial/ClientFilters';
import { clientTableColumns } from '@/components/commercial/clientTableColumns';



export default function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const deleteClient = useDeleteClient();

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<DbClient | null>(null);

  const filteredClients = useMemo(() => clients.filter((client) => {
    if (filters.status && client.status !== filters.status) return false;
    if (filters.segment && client.segment !== filters.segment) return false;
    if (filters.state && client.address_state !== filters.state) return false;
    if (filters.abc_classification && client.abc_classification !== filters.abc_classification) return false;
    return true;
  }), [clients, filters]);


  const handleOpenForm = (client?: DbClient) => {
    setSelectedClient(client || null);
    setIsFormOpen(true);
  };

  /**
   * QA-UX (rodada 10, UX10-01): o `AlertDialogAction` do Radix fecha o
   * dialogo por padrao ANTES de a mutacao responder. Se o DELETE falha
   * (RLS, FK, rede, backend indisponivel), o usuario perdia a confirmacao
   * e o contexto, restando apenas um toast. Agora o fechamento ocorre
   * SOMENTE no `onSuccess`; em falha o dialogo permanece aberto para que
   * a pessoa possa cancelar ou tentar de novo sem reabrir a acao.
   */
  const handleDelete = () => {
    if (!selectedClient) return;
    deleteClient.mutate(selectedClient.id, {
      onSuccess: () => { setIsDeleteOpen(false); setSelectedClient(null); },
      onError: () => { setIsDeleteOpen(true); },
    });
  };

  const renderActions = (client: DbClient) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações do cliente ${client.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { setSelectedClient(client); setIsViewOpen(true); }}>
          <Eye className="mr-2 h-4 w-4" />Visualizar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleOpenForm(client)}>
          <Pencil className="mr-2 h-4 w-4" />Editar
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedClient(client); setIsDeleteOpen(true); }}>
          <Trash2 className="mr-2 h-4 w-4" />Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return <PageLoading message="Carregando clientes..." />;
  }

  return (
    <PageContainer>
      <PageHeader title="Clientes" description="Gerencie sua base de clientes com inteligência comercial">
        <ExportButton
          data={filteredClients as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'code', label: 'Código' }, { key: 'name', label: 'Nome/Razão Social' },
            { key: 'document', label: 'CPF/CNPJ' }, { key: 'email', label: 'E-mail' },
            { key: 'phone', label: 'Telefone' }, { key: 'address_city', label: 'Cidade' },
            { key: 'address_state', label: 'UF' },
            { key: 'credit_limit', label: 'Limite de Crédito', format: (v) => formatBRL(Number(v)) },
            { key: 'status', label: 'Status' },
          ]}
          filename="clientes"
        />
        <Button onClick={() => handleOpenForm()} className="gap-2">
          <Plus className="h-4 w-4" />Novo Cliente
        </Button>
      </PageHeader>

      <ClientStats clients={clients} />

      <ClientFilters values={filters} onChange={setFilters} onClear={() => setFilters({})} />

      <DataTable columns={clientTableColumns} data={filteredClients} searchPlaceholder="Buscar por nome, CPF/CNPJ, e-mail..." pageSize={10} actions={renderActions} />

      <ClientFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        client={selectedClient}
        totalClients={clients.length}
      />

      <ClientDetailDialog client={selectedClient} open={isViewOpen} onOpenChange={setIsViewOpen} />

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente "{selectedClient?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteClient.isPending}
            >
              {deleteClient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
