import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import {
  ARTICLE_SHEET_STATUS_LABELS,
  describeArticleSheet,
  validateArticleSheetDraft,
  type ArticleSheet,
  type ArticleSheetFields,
} from "@/lib/production/articleSheets";
import { approveArticleSheetVersion, createArticleSheetDraft } from "@/services/production/articleSheets";

const NONE = "__none__";

export interface ArticleProductOption {
  id: string;
  code: string;
  name: string;
}

const emptyFields: ArticleSheetFields = {
  composition: null,
  construction: null,
  target_gsm: null,
  gsm_tolerance_pct: null,
  target_width_cm: null,
  width_tolerance_cm: null,
  warp_density_per_cm: null,
  weft_density_per_cm: null,
};

export function ArticleSheetManagerDialog({
  open,
  onOpenChange,
  products,
  sheets,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ArticleProductOption[];
  sheets: ArticleSheet[];
  onChanged: () => Promise<void> | void;
}) {
  const [productId, setProductId] = useState(NONE);
  const [composition, setComposition] = useState("");
  const [construction, setConstruction] = useState("");
  const [fields, setFields] = useState<ArticleSheetFields>(emptyFields);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productSheets = useMemo(
    () => (productId === NONE ? sheets : sheets.filter((sheet) => sheet.product_id === productId)),
    [productId, sheets],
  );

  const numberOrNull = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const setNumeric = (key: keyof ArticleSheetFields, value: string) => {
    setFields((current) => ({ ...current, [key]: numberOrNull(value) }));
    setError(null);
  };

  const numericInput = (label: string, key: keyof ArticleSheetFields, step = "0.01") => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" min="0" step={step} value={fields[key] ?? ""} onChange={(event) => setNumeric(key, event.target.value)} />
    </div>
  );

  const create = async () => {
    if (productId === NONE) {
      setError("Selecione o artigo da ficha.");
      return;
    }
    const draft: ArticleSheetFields = {
      ...fields,
      composition: composition.trim() || null,
      construction: construction.trim() || null,
    };
    const validationError = validateArticleSheetDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const created = await createArticleSheetDraft(productId, draft, notes);
      toast.success(`Ficha do artigo v${created.version} criada como rascunho`);
      setComposition("");
      setConstruction("");
      setFields(emptyFields);
      setNotes("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar a ficha.");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (sheet: ArticleSheet) => {
    setSaving(true);
    try {
      await approveArticleSheetVersion(sheet.id);
      toast.success(`Ficha do artigo v${sheet.version} aprovada`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar a ficha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha técnica do artigo (versionada)</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A construção do artigo (composição, ligamento, gramatura, largura, densidades e tolerâncias)
              é cadastrada como rascunho e só entra na OP depois de aprovada. Aprovar uma nova versão
              substitui a aprovada anterior do artigo; a OP guarda um snapshot da versão que usou.
              Preencha só o que a empresa validou — campo vazio não é presumido.
            </AlertDescription>
          </Alert>

          <div className="space-y-1">
            <Label>Artigo</Label>
            <Select value={productId} onValueChange={(value) => { setProductId(value); setError(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione o artigo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione o artigo</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <section className="space-y-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Nova versão (rascunho)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Composição</Label><Input value={composition} onChange={(e) => { setComposition(e.target.value); setError(null); }} placeholder="Somente a informada pela empresa" /></div>
              <div className="space-y-1"><Label>Construção / ligamento</Label><Input value={construction} onChange={(e) => { setConstruction(e.target.value); setError(null); }} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {numericInput("Gramatura alvo (g/m²)", "target_gsm")}
              {numericInput("Tolerância da gramatura (%)", "gsm_tolerance_pct")}
              {numericInput("Largura alvo (cm)", "target_width_cm")}
              {numericInput("Tolerância da largura (cm)", "width_tolerance_cm")}
              {numericInput("Densidade de urdume (fios/cm)", "warp_density_per_cm")}
              {numericInput("Densidade de trama (batidas/cm)", "weft_density_per_cm")}
              <div className="space-y-1 md:col-span-2"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={create} disabled={saving}>Criar rascunho</Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Versões do artigo ({productSheets.length})</h3>
            {productSheets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma versão cadastrada para este artigo.</p>
            ) : productSheets.map((sheet) => (
              <div key={sheet.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="text-sm font-medium">v{sheet.version}</span>
                <Badge variant={sheet.status === "approved" ? "default" : "secondary"}>{ARTICLE_SHEET_STATUS_LABELS[sheet.status]}</Badge>
                {describeArticleSheet(sheet) && (
                  <span className="text-xs text-muted-foreground">{describeArticleSheet(sheet)}</span>
                )}
                {sheet.status === "draft" && (
                  <Button size="sm" className="ml-auto" onClick={() => approve(sheet)} disabled={saving}>
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Aprovar
                  </Button>
                )}
              </div>
            ))}
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
