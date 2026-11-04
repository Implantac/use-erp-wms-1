import { useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import {
  describeSizingRecipeParameters,
  validateSizingRecipeDraft,
  type SizingIngredient,
  type SizingRecipe,
  type SizingRecipeParameters,
} from "@/lib/production/sizingRecipes";
import { approveSizingRecipeVersion, createSizingRecipeDraft } from "@/services/production/sizingRecipes";

const NONE = "__none__";

export interface RecipeProductOption {
  id: string;
  code: string;
  name: string;
}

const statusLabels: Record<SizingRecipe["status"], string> = {
  draft: "Rascunho",
  approved: "Aprovada",
  superseded: "Substituída",
  inactive: "Inativa",
};

const emptyParameters: SizingRecipeParameters = {
  concentration_pct: null,
  bath_temperature_c: null,
  speed_m_min: null,
  drying_temperature_c: null,
  warp_moisture_pct: null,
};

export function SizingRecipeManagerDialog({
  open,
  onOpenChange,
  products,
  recipes,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: RecipeProductOption[];
  recipes: SizingRecipe[];
  onChanged: () => Promise<void> | void;
}) {
  const [recipeCode, setRecipeCode] = useState("");
  const [name, setName] = useState("");
  const [sizeProductId, setSizeProductId] = useState(NONE);
  const [ingredients, setIngredients] = useState<SizingIngredient[]>([{ name: "", quantity: null, unit: "" }]);
  const [parameters, setParameters] = useState<SizingRecipeParameters>(emptyParameters);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numberOrNull = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const setParameter = (key: keyof SizingRecipeParameters, value: string) => {
    setParameters((current) => ({ ...current, [key]: numberOrNull(value) }));
    setError(null);
  };

  const create = async () => {
    const draft = {
      recipeCode,
      name,
      sizeProductId: sizeProductId === NONE ? null : sizeProductId,
      ingredients: ingredients.filter((item) => item.name.trim() || item.quantity !== null || item.unit.trim()),
      parameters,
      notes,
    };
    const validationError = validateSizingRecipeDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const created = await createSizingRecipeDraft(draft);
      toast.success(`Receita ${created.recipe_code} v${created.version} criada como rascunho`);
      setRecipeCode("");
      setName("");
      setSizeProductId(NONE);
      setIngredients([{ name: "", quantity: null, unit: "" }]);
      setParameters(emptyParameters);
      setNotes("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar a receita.");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (recipe: SizingRecipe) => {
    setSaving(true);
    try {
      await approveSizingRecipeVersion(recipe.id);
      toast.success(`Receita ${recipe.recipe_code} v${recipe.version} aprovada`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar a receita.");
    } finally {
      setSaving(false);
    }
  };

  const parameterInput = (label: string, key: keyof SizingRecipeParameters, max?: number) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        max={max}
        step="0.01"
        value={parameters[key] ?? ""}
        onChange={(event) => setParameter(key, event.target.value)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receitas de engomagem da empresa</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Cadastre a receita como rascunho e aprove quando estiver liberada. Aprovar uma nova versão
              substitui a aprovada anterior do mesmo código; a OP só usa versão aprovada e copia os parâmetros dela.
            </AlertDescription>
          </Alert>

          <section className="space-y-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Nova versão (rascunho)</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Código da receita</Label><Input value={recipeCode} onChange={(e) => { setRecipeCode(e.target.value); setError(null); }} placeholder="Ex.: código interno da empresa" /></div>
              <div className="space-y-1"><Label>Nome</Label><Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} /></div>
              <div className="space-y-1">
                <Label>Produto de goma</Label>
                <Select value={sizeProductId} onValueChange={setSizeProductId}>
                  <SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {products.map((product) => <SelectItem key={product.id} value={product.id}>{product.code} — {product.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ingredientes (somente os da empresa)</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setIngredients((items) => [...items, { name: "", quantity: null, unit: "" }])}>
                  <Plus className="mr-1 h-3 w-3" /> Ingrediente
                </Button>
              </div>
              {ingredients.map((ingredient, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_140px_120px_auto]">
                  <Input placeholder="Nome do ingrediente" value={ingredient.name} onChange={(e) => setIngredients((items) => items.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
                  <Input type="number" min="0" step="0.001" placeholder="Quantidade" value={ingredient.quantity ?? ""} onChange={(e) => setIngredients((items) => items.map((item, i) => i === index ? { ...item, quantity: numberOrNull(e.target.value) } : item))} />
                  <Input placeholder="Unidade" value={ingredient.unit} onChange={(e) => setIngredients((items) => items.map((item, i) => i === index ? { ...item, unit: e.target.value } : item))} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setIngredients((items) => items.filter((_, i) => i !== index))} disabled={ingredients.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {parameterInput("Concentração (%)", "concentration_pct", 100)}
              {parameterInput("Temperatura do banho (°C)", "bath_temperature_c")}
              {parameterInput("Velocidade (m/min)", "speed_m_min")}
              {parameterInput("Temperatura de secagem (°C)", "drying_temperature_c")}
              {parameterInput("Umidade do urdume (%)", "warp_moisture_pct", 100)}
              <div className="space-y-1"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>

            <div className="flex justify-end">
              <Button onClick={create} disabled={saving}>Criar rascunho</Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Versões cadastradas ({recipes.length})</h3>
            {recipes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma receita cadastrada ainda.</p>
            ) : recipes.map((recipe) => (
              <div key={recipe.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="font-mono text-sm font-medium">{recipe.recipe_code} v{recipe.version}</span>
                <span className="text-sm">{recipe.name}</span>
                <Badge variant={recipe.status === "approved" ? "default" : "secondary"}>{statusLabels[recipe.status]}</Badge>
                {describeSizingRecipeParameters(recipe.parameters) && (
                  <span className="text-xs text-muted-foreground">{describeSizingRecipeParameters(recipe.parameters)}</span>
                )}
                {recipe.ingredients.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {recipe.ingredients.map((item) => `${item.name}${item.quantity !== null ? ` ${item.quantity} ${item.unit}` : ""}`).join(" · ")}
                  </span>
                )}
                {recipe.status === "draft" && (
                  <Button size="sm" className="ml-auto" onClick={() => approve(recipe)} disabled={saving}>
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
