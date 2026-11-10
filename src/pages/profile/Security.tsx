import { useConfirm } from '@/shared/components/confirmContext';
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/ui/base/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/base/card";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Badge } from "@/ui/base/badge";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { PageContainer } from "@/shared/components/PageContainer";
import { PageHeader } from "@/shared/components/PageHeader";

type Factor = { id: string; friendly_name?: string; factor_type: string; status: string };

export default function ProfileSecurity() {
  const confirm = useConfirm();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) toast.error("Erro ao carregar fatores 2FA");
    setFactors(((data?.all ?? []) as unknown) as Factor[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const startEnroll = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString("pt-BR")}`,
    });
    setEnrolling(false);
    if (error || !data) {
      toast.error(error?.message ?? "Falha ao iniciar 2FA");
      return;
    }
    setQr({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async () => {
    if (!qr || !code) return;
    setVerifying(true);
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: qr.factorId });
    if (chErr || !challenge) {
      setVerifying(false);
      toast.error("Falha ao gerar desafio");
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: qr.factorId,
      challengeId: challenge.id,
      code,
    });
    setVerifying(false);
    if (error) {
      toast.error("Código inválido. Tente novamente.");
      return;
    }
    toast.success("2FA ativado com sucesso");
    setQr(null);
    setCode("");
    await load();
  };

  const remove = async (id: string) => {
    if (!await confirm({ title: 'Remover fator 2FA?', description: 'Este método de autenticação será desativado.', confirmLabel: 'Remover', variant: 'destructive' })) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(error.message);
    else toast.success("Fator removido");
    await load();
  };

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <PageContainer>
      <PageHeader
        title="Segurança da conta"
        description="Autenticação em dois fatores (2FA) e gestão de sessões"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" /> Autenticação em dois fatores
              </CardTitle>
              <CardDescription>
                Adicione uma camada extra com Google Authenticator, 1Password, Authy ou similar.
              </CardDescription>
            </div>
            <Badge variant={verified.length > 0 ? "default" : "secondary"}>
              {verified.length > 0 ? (
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Ativo
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <ShieldOff className="h-3 w-3" /> Desativado
                </span>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              {factors.length > 0 && (
                <div className="space-y-2">
                  {factors.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{f.friendly_name ?? f.factor_type}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.factor_type.toUpperCase()} · {f.status}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => remove(f.id)}>
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {!qr ? (
                <Button onClick={startEnroll} disabled={enrolling}>
                  {enrolling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Adicionar novo fator (TOTP)
                </Button>
              ) : (
                <div className="space-y-3 rounded-md border bg-muted/30 p-4">
                  <p className="text-sm font-medium">
                    1. Escaneie o QR Code no seu app autenticador
                  </p>
                  <div className="flex justify-center bg-white p-4 rounded">
                    <img src={qr.qrCode} alt="QR Code 2FA" className="h-48 w-48" />
                  </div>
                  <p className="text-xs text-muted-foreground break-all">
                    Ou digite manualmente: <code className="font-mono">{qr.secret}</code>
                  </p>
                  <div>
                    <Label htmlFor="totp">2. Insira o código de 6 dígitos gerado</Label>
                    <Input
                      id="totp"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={verify} disabled={verifying || code.length !== 6}>
                      {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Ativar 2FA
                    </Button>
                    <Button variant="ghost" onClick={() => setQr(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
