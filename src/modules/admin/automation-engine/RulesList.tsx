import { useConfirm } from '@/shared/components/confirmContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { Badge } from "@/ui/base/badge";
import { Switch } from "@/ui/base/switch";
import { Trash2, Zap, History, Edit } from "lucide-react";
import { EmptyState } from "@/shared/components/EmptyState";
import type { AutomationRule } from "@/hooks/useAutomationEngine";

interface Props {
  rules: AutomationRule[];
  isLoading: boolean;
  onEdit: (r: AutomationRule) => void;
  onHistory: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
}

export function RulesList({ rules, isLoading, onEdit, onHistory, onToggle, onRemove }: Props) {
  const confirm = useConfirm();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras ({rules.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : rules.length === 0 ? (
          <EmptyState
            compact
            icon={Zap}
            title="Nenhuma regra configurada"
            description="Crie regras para automatizar ações a partir de eventos do ERP."
          />
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {r.name}
                    <Badge variant="outline">{r.trigger_event}</Badge>
                    {!r.is_active && <Badge variant="secondary">Inativa</Badge>}
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.actions.length} ação(ões) ·{" "}
                    {r.conditions.length} condição(ões)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => onToggle(r.id, v)}
                  />
                  <Button size="icon" variant="ghost" onClick={() => onHistory(r.id)}>
                    <History className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onEdit(r)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir regra?', description: `A regra "${r.name}" será removida.`, confirmLabel: 'Excluir', variant: 'destructive' })) onRemove(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
