import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { ExportButton } from '@/shared/components/ExportButton';
import { Button } from '@/ui/base/button';
import { UserPlus } from 'lucide-react';
import { PageLoading } from '@/shared/components/PageLoading';
import { SystemUser, UserFilter } from '@/types/administration';
import { useUsers } from '@/hooks/system/useUsers';
import { UsersStats } from './users/UsersStats';
import { UsersFilters } from './users/UsersFilters';
import { UsersTable } from './users/UsersTable';
import { UserDialog } from './users/UserDialog';
import { SectorAccessCard } from './users/SectorAccessCard';

const UsersPage = () => {
  const { users, isLoading, isFetching, isRetrying, error, refetch } = useUsers();
  const [filter, setFilter] = useState<UserFilter>({ role: 'all', status: 'all' });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  const filteredUsers = useMemo(() => {
    return (users || []).filter(user => {
      const matchesSearch = !filter.search || 
        user.name.toLowerCase().includes(filter.search.toLowerCase()) ||
        user.email.toLowerCase().includes(filter.search.toLowerCase()) ||
        user.department?.toLowerCase().includes(filter.search.toLowerCase());
      const matchesRole = filter.role === 'all' || user.role === filter.role;
      const matchesStatus = filter.status === 'all' || user.status === filter.status;
      const matchesBranch = !filter.branchId || user.branchId === filter.branchId;
      return matchesSearch && matchesRole && matchesStatus && matchesBranch;
    });
  }, [users, filter]);

  const handleCreateUser = () => {
    setEditingUser(null);
    setIsDialogOpen(true);
  };

  const handleEditUser = (user: SystemUser) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  // QA-UX r16: nao montar os filhos quando a consulta falha. UsersTable,
  // SectorAccessCard e UserDialog tambem observam useUsers; monta-los no
  // estado de erro reiniciava a query (retryOnMount) e o spinner sem fim.
  // A falha nao e uma lista vazia nem autoriza criar/exportar usuarios.
  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Gestão de Usuários" description="Gerencie usuários e permissões do sistema" />
        <section
          role="alert"
          aria-labelledby="users-load-error-title"
          data-ux-users-error="true"
          className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <h2 id="users-load-error-title" className="font-semibold">Não foi possível carregar os usuários.</h2>
          <p className="text-sm text-muted-foreground">
            A lista não está disponível. Tente novamente; se o problema continuar, contate o administrador.
          </p>
          <Button variant="outline" disabled={isFetching} aria-busy={isFetching} onClick={() => { void refetch(); }}>
            {isFetching ? 'Tentando novamente…' : 'Tentar novamente'}
          </Button>
        </section>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Gestão de Usuários" description="Gerencie usuários e permissões do sistema" />
        <PageLoading message="Carregando usuários…" retrying={isRetrying} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader 
        title="Gestão de Usuários" 
        description="Gerencie usuários e permissões do sistema"
      >
        <ExportButton
          data={filteredUsers as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'name', label: 'Nome' },
            { key: 'email', label: 'E-mail' },
            { key: 'role', label: 'Perfil' },
            { key: 'department', label: 'Departamento' },
            { key: 'status', label: 'Status' },
          ]}
          filename="usuarios"
        />
        <Button onClick={handleCreateUser}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </PageHeader>

      <UsersStats users={users} />
      <UsersFilters filter={filter} setFilter={setFilter} />
      <UsersTable users={filteredUsers} onEdit={handleEditUser} />
      <SectorAccessCard />

      <UserDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        editingUser={editingUser}
      />
    </PageContainer>
  );
};

export default UsersPage;
