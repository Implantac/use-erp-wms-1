import { useConfirm } from '@/shared/components/confirmContext';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/ui/base/table';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { 
  Edit2, Trash2, UserCheck, UserX, Clock, MoreVertical, Key, Mail, Users
} from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/ui/base/dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SystemUser, UserRole, UserStatus } from '@/types/administration';
import { userRoleConfig, userStatusConfig } from '@/config/administration';
import { useUsers } from '@/hooks/system/useUsers';
import { toast } from 'sonner';

interface UsersTableProps {
  users: SystemUser[];
  onEdit: (user: SystemUser) => void;
}

export const UsersTable = ({ users, onEdit }: UsersTableProps) => {
  const confirm = useConfirm();
  const { deleteUser, toggleBan, resetPassword } = useUsers();

  const handleToggleStatus = async (user: SystemUser) => {
    const isBanned = user.status === 'blocked';
    await toggleBan({ user_id: user.id, banned: !isBanned });
  };

  const handleResetPassword = async (user: SystemUser) => {
    await resetPassword(user.email);
  };

  const handleDeleteUser = async (user: SystemUser) => {
    if (await confirm({ title: 'Excluir usuário?', description: 'Tem certeza que deseja excluir este usuário permanentemente?', confirmLabel: 'Excluir', variant: 'destructive' })) {
      await deleteUser(user.id);
    }
  };

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último Acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-4">
                  <EmptyState
                    compact
                    icon={Users}
                    title="Nenhum usuário encontrado"
                    description="Convide colaboradores ou ajuste os filtros para visualizar acessos ativos."
                  />
                </TableCell>
              </TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />{user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${userRoleConfig[user.role as UserRole]?.bgColor || 'bg-gray-100'} ${userRoleConfig[user.role as UserRole]?.color || 'text-gray-700'} border-0`}>
                    {userRoleConfig[user.role as UserRole]?.label || user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={`${userStatusConfig[user.status as UserStatus]?.bgColor || 'bg-gray-100'} ${userStatusConfig[user.status as UserStatus]?.color || 'text-gray-700'} border-0`}>
                    {userStatusConfig[user.status as UserStatus]?.label || user.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {user.lastLogin ? format(new Date(user.lastLogin), "dd/MM/yyyy HH:mm", { locale: ptBR }) : 'Nunca'}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(user)}><Edit2 className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleResetPassword(user)}><Key className="h-4 w-4 mr-2" />Redefinir Senha</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                        {user.status === 'blocked' ? (
                          <><UserCheck className="h-4 w-4 mr-2" />Desbloquear</>
                        ) : (
                          <><UserX className="h-4 w-4 mr-2 text-red-600" /><span className="text-red-600">Bloquear</span></>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeleteUser(user)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
