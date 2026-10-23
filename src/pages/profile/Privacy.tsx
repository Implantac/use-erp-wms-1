import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseFunctionsUrl, getSupabasePublishableKey } from "@/integrations/supabase/config";
import { Button } from "@/ui/base/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/base/card";
import { Badge } from "@/ui/base/badge";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { Download, Trash2, FileText, ShieldQuestion, Loader2 } from "lucide-react";
import { EmptyState } from "@/shared/components/EmptyState";
import { PageContainer } from "@/shared/components/PageContainer";
import { PageHeader } from "@/shared/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/ui/base/alert-dialog";

type RequestRow = {
  id: string;
  request_type: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
};

export default function ProfilePrivacy() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lgpd_data_requests")
      .select("id, request_type, status, requested_at, completed_at")
      .order("requested_at", { ascending: false })
      .limit(20);
    setRequests((data ?? []) as RequestRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const exportData = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${getSupabaseFunctionsUrl()}/lgpd-export`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: getSupabasePublishableKey(),
          },
        },
      );
      if (!res.ok) throw new Error("Falha na exportação");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dados exportados com sucesso");
      await load();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Falha ao exportar"));
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("lgpd-delete", {
        body: { confirm: "DELETE" },
      });
      if (error) throw error;
      toast.success(data?.message ?? "Conta anonimizada");
      setTimeout(() => supabase.auth.signOut(), 1500);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Falha ao excluir"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Privacidade & LGPD"
        description="Seus direitos como titular dos dados conforme Lei nº 13.709/2018"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" /> Exportar meus dados
            </CardTitle>
            <CardDescription>
              Art. 18 II/V — Receba todos seus dados pessoais em formato JSON portável.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={exportData} disabled={exporting}>
              {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Baixar exportação
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Excluir minha conta
            </CardTitle>
            <CardDescription>
              Art. 18 VI — Anonimiza seus dados pessoais. Documentos fiscais são retidos pelo
              prazo legal (5 anos).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Solicitar exclusão</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir conta definitivamente?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Seu nome, e-mail, telefone e avatar serão anonimizados. Pedidos, NF-e e
                    lançamentos contábeis serão preservados (anonimamente) pelo prazo legal de
                    5 anos. Esta ação é irreversível.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deleteAccount}
                    disabled={deleting}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar exclusão
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldQuestion className="h-5 w-5" /> O que coletamos e por quê
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Identificação</strong>: nome, e-mail, telefone
            (base legal: execução de contrato — art. 7º V).
          </p>
          <p>
            <strong className="text-foreground">Documentos fiscais</strong>: CNPJ/CPF de
            clientes/fornecedores (base legal: obrigação legal — art. 7º II, retenção 5 anos).
          </p>
          <p>
            <strong className="text-foreground">Logs operacionais</strong>: ações no sistema
            (base legal: legítimo interesse — art. 7º IX, retenção 180 dias).
          </p>
          <p>
            <strong className="text-foreground">Comunicações</strong>: e-mails e WhatsApp
            transacionais (base legal: consentimento — art. 7º I).
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Histórico de solicitações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : requests.length === 0 ? (
            <EmptyState icon={ShieldQuestion} title="Sem solicitações LGPD" description="Solicitações de acesso, portabilidade ou exclusão aparecerão aqui após serem registradas." />
          ) : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium capitalize">{r.request_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.requested_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Badge
                    variant={r.status === "completed" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
