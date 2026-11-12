import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService, InviteUserData, ChangeRoleData } from '@/services/system/usersService';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import type { SystemUser } from '@/types/administration';
import { errorMessage } from '@/lib/errors';
import { useAppStore } from '@/stores/useAppStore';

export function useUsers() {
  const queryClient = useQueryClient();
  const { userRole } = useAppStore();

  const usersQuery = useQuery<SystemUser[]>({
    queryKey: ['admin-users'],
    queryFn: () => usersService.getAll(),
    enabled: userRole === 'admin',
  });

  const inviteUserMutation = useMutation({
    mutationFn: (userData: InviteUserData) => usersService.invite(userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toastSuccess('Usuário convidado com sucesso');
    },
    onError: (error: unknown) => {
      toastError(errorMessage(error, 'Erro ao convidar usuário'));
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => usersService.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toastSuccess('Usuário excluído com sucesso');
    },
    onError: (error: unknown) => {
      toastError(errorMessage(error, 'Erro ao excluir usuário'));
    }
  });

  const changeRoleMutation = useMutation({
    mutationFn: (data: ChangeRoleData) => usersService.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toastSuccess('Perfil atualizado com sucesso');
    },
    onError: (error: unknown) => {
      toastError(errorMessage(error, 'Erro ao atualizar perfil'));
    }
  });

  const toggleBanMutation = useMutation({
    mutationFn: ({ user_id, banned }: { user_id: string; banned: boolean }) => 
      usersService.toggleBan(user_id, banned),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toastSuccess(`Usuário ${variables.banned ? 'bloqueado' : 'desbloqueado'} com sucesso`);
    },
    onError: (error: unknown) => {
      toastError(errorMessage(error, 'Erro ao alterar status do usuário'));
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (email: string) => usersService.resetPassword(email),
    onSuccess: () => {
      toastSuccess('Email de redefinição enviado com sucesso');
    },
    onError: (error: unknown) => {
      toastError(errorMessage(error, 'Erro ao enviar email de redefinição'));
    }
  });

  return {
    users: usersQuery.data || [],
    isLoading: usersQuery.isLoading,
    isFetching: usersQuery.isFetching,
    isRetrying: usersQuery.isFetching && usersQuery.failureCount > 0,
    error: usersQuery.error,
    refetch: usersQuery.refetch,
    
    // Mutations
    inviteUser: inviteUserMutation.mutateAsync,
    deleteUser: deleteUserMutation.mutateAsync,
    changeRole: changeRoleMutation.mutateAsync,
    toggleBan: toggleBanMutation.mutateAsync,
    resetPassword: resetPasswordMutation.mutateAsync,
    
    // Loading states
    isInviting: inviteUserMutation.isPending,
    isDeleting: deleteUserMutation.isPending,
    isChangingRole: changeRoleMutation.isPending,
    isTogglingBan: toggleBanMutation.isPending,
    isSendingReset: resetPasswordMutation.isPending,
  };
}
