import { useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import {
  describeDyeRecipeParameters,
  validateDyeRecipeDraft,
  type DyeIngredient,
  type DyeRecipe,
  type DyeRecipeParameters,
} from "@/lib/production/dyeRecipes";
import { approveDyeRecipeVersion, createDyeRecipeDraft } from "@/services/production/dyeRecipes";

const statusLabels: Record<DyeRecipe["status"], string> = {
  draft: "Rascunho",
  approved: "Aprovada",
  superseded: "Substituída",
  inactive: "Inativa",
};

const emptyParameters: DyeRecipeParameters = {
  bath_ratio: null,
  dyeing_temperature_c: null,
  dyeing_time_min: null,
  ph_target: null,
};

export function DyeRecipeManagerDialog({
  open,
  onOpenChange,
  recipes,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipes: DyeRecipe[];
  onChanged: () => Promise<void> | void;
}) {
  const [recipeCode, setRecipeCode] = useState("");
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState<DyeIngredient[]>([{ name: "", quantity: null, unit: "" }]);
  const [parameters, setParameters] = useState<DyeRecipeParameters>(emptyParameters);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numberOrNull = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const setParameter = (key: keyof DyeRecipeParameters, value: string) => {
    setParameters((current) => ({ ...current, [key]: numberOrNull(value) }));
    setError(null);
  };

  const create = async () => {
    const draft = {
      recipeCode,
      name,
      ingredients: ingredients.filter((item) => item.name.trim() || item.quantity !== null || item.unit.trim()),
      parameters,
      notes,
    };
    const validationError = validateDyeRecipeDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const created = await createDyeRecipeDraft(draft);
      toast.success(`Receita ${created.recipe_code} v${created.version} criada como rascunho`);
      setRecipeCode("");
      setName("");
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

  const approve = async (recipe: DyeRecipe) => {
    setSaving(true);
    try {
      await approveDyeRecipeVersion(recipe.id);
      toast.success(`Receita ${recipe.recipe_code} v${recipe.version} aprovada`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar a receita.");
    } finally {
      setSaving(false);
    }
  };

  const parameterInput = (label: string, key: keyof DyeRecipeParameters, max?: number) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" min="0" max={max} step="0.01" value={parameters[key] ?? ""} onChange={(event) => setParameter(key, event.target.value)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receitas de tingimento da empresa</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Cadastre a receita como rascunho e aprove somente após a validação técnica da empresa.
              Aprovar uma nova versão substitui a aprovada anterior do mesmo código; a OP só usa versão
              aprovada e copia banho, temperatura, tempo e pH dela. Nenhuma dosagem é presumida.
            </AlertDescription>
          </Alert>

          <section className="space-y-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Nova versão (rascunho)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Código da receita</Label><Input value={recipeCode} onChange={(e) => { setRecipeCode(e.target.value); setError(null); }} placeholder="Ex.: código interno da empresa" /></div>
              <div className="space-y-1"><Label>Nome</Label><Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Corantes e auxiliares (somente os da empresa)</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setIngredients((items) => [...items, { name: "", quantity: null, unit: "" }])}>
                  <Plus className="mr-1 h-3 w-3" /> Item
                </Button>
              </div>
              {ingredients.map((ingredient, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_140px_120px_auto]">
                  <Input placeholder="Nome do corante/auxiliar" value={ingredient.name} onChange={(e) => setIngredients((items) => items.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
                  <Input type="number" min="0" step="0.001" placeholder="Quantidade" value={ingredient.quantity ?? ""} onChange={(e) => setIngredients((items) => items.map((item, i) => i === index ? { ...item, quantity: numberOrNull(e.target.value) } : item))} />
                  <Input placeholder="Unidade (%, g/L...)" value={ingredient.unit} onChange={(e) => setIngredients((items) => items.map((item, i) => i === index ? { ...item, unit: e.target.value } : item))} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setIngredients((items) => items.filter((_, i) => i !== index))} disabled={ingredients.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {parameterInput("Relação de banho (1:X)", "bath_ratio")}
              {parameterInput("Temperatura do tingimento (°C)", "dyeing_temperature_c")}
              {parameterInput("Tempo do tingimento (min)", "dyeing_time_min")}
              {parameterInput("pH alvo", "ph_target", 14)}
              <div className="space-y-1 md:col-span-2"><Label>Observações</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
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
                {describeDyeRecipeParameters(recipe.parameters) && (
                  <span className="text-xs text-muted-foreground">{describeDyeRecipeParameters(recipe.parameters)}</span>
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
