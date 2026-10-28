import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { ExportButton } from '@/shared/components/ExportButton';
import { Button } from '@/ui/base/button';
import { UserPlus, Loader2 } from 'lucide-react';
import { SystemUser, UserFilter } from '@/types/administration';
import { useUsers } from '@/hooks/system/useUsers';
import { UsersStats } from './users/UsersStats';
import { UsersFilters } from './users/UsersFilters';
import { UsersTable } from './users/UsersTable';
import { UserDialog } from './users/UserDialog';

const UsersPage = () => {
  const { users, isLoading } = useUsers();
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

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
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
