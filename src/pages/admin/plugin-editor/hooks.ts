import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from '@/lib/errors';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from "@/integrations/supabase/client";
import { handleMutationError, toastSuccess } from "@/lib/toastHelpers";
import { usePrompt } from "@/shared/components/confirmContext";
import type { PluginDraft, PluginRow, PluginVersionRow } from "./types";

export function usePluginsAll() {
  return useQuery({
    queryKey: ["plugins_admin_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plugins")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PluginRow[];
    },
  });
}

export function usePluginVersions(pluginId: string | null) {
  return useQuery({
    queryKey: ["plugin_versions", pluginId],
    enabled: !!pluginId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plugin_versions")
        .select("id, version, changelog, published_at")
        .eq("plugin_id", pluginId!)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PluginVersionRow[];
    },
  });
}

export function useSavePlugin(opts: {
  draft: PluginDraft | null;
  manifestText: string;
  selectedId: string | "new" | null;
  onSaved: (row: PluginRow) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { draft, manifestText, selectedId } = opts;
      if (!draft) throw new Error("Nenhum plugin selecionado");
      let manifest: Json = null;
      try {
        manifest = manifestText.trim() ? JSON.parse(manifestText) : {};
      } catch (e) {
        throw new Error(`Manifest JSON inválido: ${errorMessage(e)}`);
      }
      const payload = {
        key: draft.key.trim(),
        name: draft.name.trim(),
        description: draft.description || null,
        category: draft.category || "general",
        vendor: draft.vendor || null,
        version: draft.version || "0.1.0",
        required_modules: draft.required_modules ?? [],
        price_monthly: Number(draft.price_monthly) || 0,
        is_published: !!draft.is_published,
        sandbox_script: draft.sandbox_script || null,
        manifest,
      };
      if (!payload.key) throw new Error("Key é obrigatória");
      if (!payload.name) throw new Error("Nome é obrigatório");

      if (selectedId === "new" || !("id" in draft) || !draft.id) {
        const { data, error } = await supabase
          .from("plugins")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as PluginRow;
      }
      const { data, error } = await supabase
        .from("plugins")
        .update(payload)
        .eq("id", draft.id!)
        .select()
        .single();
      if (error) throw error;
      return data as PluginRow;
    },
    onSuccess: (row) => {
      toastSuccess("Plugin salvo");
      qc.invalidateQueries({ queryKey: ["plugins_admin_all"] });
      qc.invalidateQueries({ queryKey: ["plugins"] });
      opts.onSaved(row);
    },
    onError: handleMutationError,
  });
}

export function useRemovePlugin(onRemoved: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plugins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toastSuccess("Plugin removido");
      qc.invalidateQueries({ queryKey: ["plugins_admin_all"] });
      qc.invalidateQueries({ queryKey: ["plugins"] });
      onRemoved();
    },
    onError: handleMutationError,
  });
}

export function usePublishVersion(opts: {
  pluginId: string | null;
  draft: PluginDraft | null;
  manifestText: string;
}) {
  const qc = useQueryClient();
  // QA-UX (rodada 3): usePrompt e chamado no corpo do hook (regras de hooks),
  // nao dentro da mutationFn assincrona. Cancelar nao deve publicar nem
  // disparar onSuccess.
  const ask = usePrompt();
  return useMutation({
    mutationFn: async () => {
      const { pluginId, draft, manifestText } = opts;
      if (!pluginId || !draft) throw new Error("Salve o plugin antes de publicar uma versão");
      let manifest: Json = {};
      try {
        manifest = manifestText.trim() ? JSON.parse(manifestText) : {};
      } catch (e) {
        throw new Error(`Manifest JSON inválido: ${errorMessage(e)}`);
      }
      const changelog = await ask({
        title: 'Publicar versão',
        description: `Registre as alterações da versão ${draft.version}.`,
        inputLabel: 'Changelog',
        placeholder: 'Descreva as alterações desta versão',
        multiline: true,
        confirmLabel: 'Publicar',
      });
      if (changelog === null) return { cancelled: true };
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("plugin_versions").insert({
        plugin_id: pluginId,
        version: draft.version,
        sandbox_script: draft.sandbox_script,
        manifest,
        changelog: changelog || null,
        published_by: user?.id ?? null,
      });
      if (error) throw error;
      return { cancelled: false };
    },
    onSuccess: (result) => {
      if (result.cancelled) return;
      toastSuccess("Versão publicada");
      qc.invalidateQueries({ queryKey: ["plugin_versions", opts.pluginId] });
    },
    onError: handleMutationError,
  });
}
