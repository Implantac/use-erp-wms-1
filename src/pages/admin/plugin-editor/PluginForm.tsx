import { useConfirm } from '@/shared/components/confirmContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { Input } from "@/ui/base/input";
import { Textarea } from "@/ui/base/textarea";
import { Label } from "@/ui/base/label";
import { Switch } from "@/ui/base/switch";
import { Save, Trash2 } from "lucide-react";
import { VersionsPanel } from "./VersionsPanel";
import type { PluginDraft, PluginRow, PluginVersionRow } from "./types";

interface Props {
  draft: PluginDraft;
  selectedId: string | "new" | null;
  manifestText: string;
  manifestError: string | null;
  onManifestChange: (v: string) => void;
  onManifestError: (e: string | null) => void;
  update: <K extends keyof PluginRow>(k: K, v: PluginRow[K]) => void;
  versions: PluginVersionRow[] | undefined;
  currentPluginId: string | null;
  onPublishVersion: () => void;
  publishPending: boolean;
  onSave: () => void;
  savePending: boolean;
  onRemove: (id: string) => void;
  removePending: boolean;
}

export function PluginForm({
  draft,
  selectedId,
  manifestText,
  manifestError,
  onManifestChange,
  onManifestError,
  update,
  versions,
  currentPluginId,
  onPublishVersion,
  publishPending,
  onSave,
  savePending,
  onRemove,
  removePending,
}: Props) {
  const confirm = useConfirm();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {selectedId === "new" ? "Novo plugin" : draft.name || "Plugin"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="pl-key">Key (identificador único)</Label>
            <Input id="pl-key" value={draft.key} onChange={(e) => update("key", e.target.value)} placeholder="ex: nfe-cancelamento-massa" />
          </div>
          <div>
            <Label htmlFor="pl-name">Nome</Label>
            <Input id="pl-name" value={draft.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pl-cat">Categoria</Label>
            <Input id="pl-cat" value={draft.category} onChange={(e) => update("category", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pl-ver">Versão</Label>
            <Input id="pl-ver" value={draft.version} onChange={(e) => update("version", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pl-vendor">Vendor</Label>
            <Input id="pl-vendor" value={draft.vendor ?? ""} onChange={(e) => update("vendor", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pl-price">Preço mensal (R$)</Label>
            <Input id="pl-price" type="number" step="0.01" min="0" value={draft.price_monthly} onChange={(e) => update("price_monthly", Number(e.target.value))} />
          </div>
        </div>

        <div>
          <Label htmlFor="pl-desc">Descrição</Label>
          <Textarea id="pl-desc" rows={2} value={draft.description ?? ""} onChange={(e) => update("description", e.target.value)} />
        </div>

        <div>
          <Label htmlFor="pl-mods">Módulos requeridos (separe por vírgula)</Label>
          <Input
            id="pl-mods"
            value={(draft.required_modules ?? []).join(", ")}
            onChange={(e) =>
              update(
                "required_modules",
                e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
              )
            }
            placeholder="ex: fiscal, financial"
          />
        </div>

        <div>
          <Label htmlFor="pl-manifest">Manifest (JSON)</Label>
          <Textarea
            id="pl-manifest"
            rows={6}
            value={manifestText}
            onChange={(e) => {
              onManifestChange(e.target.value);
              try {
                if (e.target.value.trim()) JSON.parse(e.target.value);
                onManifestError(null);
              } catch (err: any) {
                onManifestError(err.message);
              }
            }}
            className="font-mono text-xs"
          />
          {manifestError && <p className="text-xs text-destructive mt-1">{manifestError}</p>}
        </div>

        <div>
          <Label htmlFor="pl-script">Sandbox script (JS — roda em Web Worker isolado)</Label>
          <Textarea
            id="pl-script"
            rows={16}
            value={draft.sandbox_script ?? ""}
            onChange={(e) => update("sandbox_script", e.target.value)}
            className="font-mono text-xs"
            spellCheck={false}
          />
        </div>

        {currentPluginId && (
          <VersionsPanel
            versions={versions}
            draftVersion={draft.version}
            isPending={publishPending}
            disabled={!!manifestError}
            onPublish={onPublishVersion}
          />
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch id="pl-pub" checked={draft.is_published} onCheckedChange={(v) => update("is_published", v)} />
            <Label htmlFor="pl-pub" className="cursor-pointer">Publicado no marketplace</Label>
          </div>
          <div className="flex gap-2">
            {selectedId !== "new" && "id" in draft && draft.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (await confirm({ title: 'Remover plugin?', description: `O plugin "${draft.name}" será removido.`, confirmLabel: 'Remover', variant: 'destructive' })) {
                    onRemove(draft.id!);
                  }
                }}
                disabled={removePending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remover
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={savePending || !!manifestError}>
              <Save className="h-4 w-4 mr-1" />
              Salvar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
