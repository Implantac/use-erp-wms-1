import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User as AppUser } from '@/types';

export class AuthService {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async getUserRole(userId: string) {
    const { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
    if (error) throw error;
    return data as AppUser['role'];
  }

  mapSupabaseUser(user: SupabaseUser, profileName?: string, role?: string): AppUser {
    return {
      id: user.id,
      name: profileName || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
      email: user.email || '',
      role: (role as AppUser['role']) || 'viewer',
      permissions: [],
    };
  }

  async signOut() {
    await supabase.auth.signOut().catch(() => undefined);
  }

  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signUp(email: string, password: string, name: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
  }

  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }
}

export const authService = new AuthService();
