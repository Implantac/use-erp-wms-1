import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { authService } from './authService';

describe('frontend identity mapping is not an authorization grant', () => {
  it('does not invent full permissions for a viewer', () => {
    const user = { id: 'test-user', email: 'viewer@example.test', user_metadata: {} } as User;
    expect(authService.mapSupabaseUser(user, 'Viewer', 'viewer').permissions).toEqual([]);
  });
});
