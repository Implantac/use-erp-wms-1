// Cliente Supabase — funciona na nuvem e na instalação local (Docker).
// A URL/chave são resolvidas por ./config (runtime local > variáveis Vite >
// própria origem da página). Ver docs/INSTALL-LOCAL.md.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';
import { getSupabasePublishableKey, getSupabaseUrl } from './config';

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_PUBLISHABLE_KEY = getSupabasePublishableKey();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  }
});
