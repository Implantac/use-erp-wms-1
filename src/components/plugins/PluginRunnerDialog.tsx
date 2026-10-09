import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnterpriseStore } from "@/core/stores/useEnterpriseStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { Badge } from "@/ui/base/badge";
import { Loader2, PlayCircle, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/base/dialog";
import { Textarea } from "@/ui/base/textarea";
import { Input } from "@/ui/base/input";
import { handleMutationError, toastSuccess } from "@/lib/toastHelpers";

interface ExecutionRow {
  id: string;
  action: string;
  status: "pending" | "success" | "error";
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  result: unknown;
}

function usePluginExecutions(pluginId?: string) {
  const companyId = useEnterpriseStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ["plugin_executions", companyId, pluginId],
    enabled: !!companyId && !!pluginId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plugin_executions")
        .select("id, action, status, duration_ms, error_message, created_at, result")
        .eq("company_id", companyId!)
        .eq("plugin_id", pluginId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ExecutionRow[];
    },
  });
}

interface ExecResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
  logs?: string[];
}

function useExecutePlugin() {
  const qc = useQueryClient();
  return useMutation<ExecResponse, Error, { pluginKey: string; action: string; payload: Record<string, unknown> }>({
    mutationFn: async (vars) => {
      const { data, error } = await supabase.functions.invoke("plugin-execute", {
        body: vars,
      });
      if (error) throw error;
      return data as ExecResponse;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["plugin_executions"] });
      if (data?.ok) toastSuccess("Execução concluída");
    },
    onError: handleMutationError,
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pluginId: string;
  pluginKey: string;
  pluginName: string;
}

export function PluginRunnerDialog({ open, onOpenChange, pluginId, pluginKey, pluginName }: Props) {
  const { data: history, isLoading } = usePluginExecutions(pluginId);
  const execute = useExecutePlugin();
  const [action, setAction] = useState(defaultAction(pluginKey));
  const [payloadText, setPayloadText] = useState("{}");

  const parsedError = useMemo(() => {
    try {
      JSON.parse(payloadText);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [payloadText]);

  const run = () => {
    if (parsedError) return;
    execute.mutate({
      pluginKey,
      action: action.trim(),
      payload: JSON.parse(payloadText) as Record<string, unknown>,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" /> {pluginName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Nova execução</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Ação</label>
                <Input value={action} onChange={(e) => setAction(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Payload JSON</label>
                <Textarea
                  rows={6}
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  className="font-mono text-xs"
                />
                {parsedError && (
                  <p className="text-xs text-destructive">JSON inválido: {parsedError}</p>
                )}
              </div>
              <Button
                onClick={run}
                disabled={!!parsedError || execute.isPending || !action.trim()}
                className="w-full"
              >
                {execute.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" /> Executar
                  </>
                )}
              </Button>

              {execute.data && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Resultado</span>
                    <Badge variant={execute.data.ok ? "default" : "destructive"}>
                      {execute.data.ok ? "ok" : "erro"}
                    </Badge>
                  </div>
                  {execute.data.error && (
                    <p className="text-xs text-destructive break-words">{execute.data.error}</p>
                  )}
                  <pre className="text-[10px] bg-muted/40 rounded p-2 max-h-32 overflow-auto font-mono">
                    {JSON.stringify(execute.data.result ?? null, null, 2)}
                  </pre>
                  {execute.data.logs && execute.data.logs.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Console ({execute.data.logs.length})
                      </span>
                      <pre className="text-[10px] bg-foreground/5 rounded p-2 max-h-32 overflow-auto font-mono whitespace-pre-wrap">
                        {execute.data.logs.join("\n")}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico (últimas 50)
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 overflow-auto space-y-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : !history || history.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem execuções ainda.</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="text-xs border rounded p-2 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono">{h.action}</span>
                      <Badge
                        variant={
                          h.status === "success"
                            ? "default"
                            : h.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {h.status}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("pt-BR")} ·{" "}
                      {h.duration_ms ?? 0}ms
                    </div>
                    {h.error_message && (
                      <div className="text-destructive">{h.error_message}</div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function defaultAction(key: string): string {
  switch (key) {
    case "whatsapp-sender":
      return "send";
    case "itau-open-banking":
      return "balance";
    case "serasa-score":
      return "score";
    case "correios-tracking":
      return "track";
    default:
      return "ping";
  }
}
