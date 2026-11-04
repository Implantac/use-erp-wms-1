import { useEffect, useMemo, useState } from "react";
import { AlertCircle, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import {
  validateTextileRouteTemplateApplication,
  type TextileRouteTemplate,
} from "@/lib/production/textileRouteTemplates";
import {
  applyTextileRouteTemplate,
  fetchTextileRouteTemplates,
} from "@/services/production/textileRouteTemplates";

interface ProductOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `route-template-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TextileRouteTemplateDialog({
  open,
  onOpenChange,
  products,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  onApplied: (routeId: string) => Promise<void> | void;
}) {
  const [templates, setTemplates] = useState<TextileRouteTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productId, setProductId] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [routeCode, setRouteCode] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    fetchTextileRouteTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar modelos têxteis."))
      .finally(() => setLoading(false));
  }, [open ]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === templateKey),
    [templates, templateKey],
  );

  const submit = async () => {
    const validationError = validateTextileRouteTemplateApplication({ productId, templateKey, templates });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const result = await applyTextileRouteTemplate({
        productId,
        templateKey,
        idempotencyKey,
        routeCode,
      });
      toast.success("Modelo têxtil aplicado", {
        description: `${result.step_count} etapa(s): ${result.created_operations} operação(ões) criada(s) e ${result.reused_operations} reutilizada(s).`,
      });
      await onApplied(result.route_id);
      setIdempotencyKey(newIdempotencyKey());
      setRouteCode("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aplicar modelo têxtil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" /> Aplicar modelo de roteiro têxtil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              O modelo cria as operações e o roteiro do produto neste setor. Tempos, máquinas, receitas e parâmetros
              ficam para configurar na empresa — nenhum valor de processo é presumido.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Produto *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {products.filter((product) => product.id).map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.code} — {product.name} ({product.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo têxtil *</Label>
              <Select value={templateKey} onValueChange={setTemplateKey}>
                <SelectTrigger><SelectValue placeholder={loading ? "Carregando modelos…" : "Selecione o modelo"} /></SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.key} value={template.key}>
                      {template.label} · {template.sector_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Código do roteiro (opcional)</Label>
              <Input value={routeCode} onChange={(event) => setRouteCode(event.target.value)} placeholder="Deixe vazio para gerar a partir do modelo e do produto" />
            </div>
          </div>

          {selectedTemplate && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-semibold">{selectedTemplate.label}</p>
                <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
              </div>
              <ol className="space-y-1 text-sm">
                {selectedTemplate.steps.map((step) => (
                  <li key={step.sequence} className="flex gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{step.sequence}.</span>
                    <span>{step.name}</span>
                    <span className="text-xs text-muted-foreground">({step.sector})</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || loading}>{saving ? "Aplicando…" : "Aplicar modelo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
