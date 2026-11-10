import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Play, Keyboard } from 'lucide-react';
import { FormField } from '@/shared/components/FormField';
import { useEnterToNextField } from '@/hooks/useEnterToNextField';
import type { NewEntryForm } from './constants';

interface ActiveOrder {
  id: string;
  order_number: string;
  product_name: string;
  produced_quantity: number;
  quantity: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeOrders: ActiveOrder[];
  form: NewEntryForm;
  setForm: (f: NewEntryForm) => void;
  onSubmit: () => void;
}

/**
 * QA-UX / S005: rótulos associados (FormField) + Enter avançando entre campos.
 * Antes: 4 `<label>` soltos, nenhum `htmlFor`, nenhum `id`, nenhum `required`.
 */
export function NewTimeEntryDialog({ open, onOpenChange, activeOrders, form, setForm, onSubmit }: Props) {
  const formRef = useEnterToNextField<HTMLDivElement>();

  // QA-UX r6: "Iniciar" desabilitado sem explicacao era uma barreira
  // silenciosa — o usuario nao sabia qual dos campos faltava.
  const pending: string[] = [];
  if (!form.operator.trim()) pending.push('Operador');
  if (!form.orderId) pending.push('Ordem de Produção');
  if (!form.operationName.trim()) pending.push('Operação / Etapa');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Apontamento</DialogTitle>
          <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            TAB ou Enter avançam entre os campos · Shift+Enter volta
          </p>
        </DialogHeader>
        <div ref={formRef} className="space-y-4">
          <FormField label="Operador" required hint="Nome de quem está registrando o apontamento">
            <Input
              value={form.operator}
              onChange={e => setForm({ ...form, operator: e.target.value })}
              placeholder="Nome do operador"
              autoComplete="name"
            />
          </FormField>

          <FormField label="Ordem de Produção" required>
            <Select value={form.orderId} onValueChange={v => setForm({ ...form, orderId: v })}>
              <SelectTrigger aria-label="Selecione uma OP"><SelectValue placeholder="Selecione uma OP" /></SelectTrigger>
              <SelectContent>
                {activeOrders.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.order_number} — {o.product_name} ({o.produced_quantity}/{o.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Operação / Etapa" required>
            <Input
              value={form.operationName}
              onChange={e => setForm({ ...form, operationName: e.target.value })}
              placeholder="Ex: Corte, Costura, Estamparia"
            />
          </FormField>

          <FormField label="Centro de Trabalho">
            <Input
              value={form.workCenter}
              onChange={e => setForm({ ...form, workCenter: e.target.value })}
              placeholder="Ex: Setor A"
            />
          </FormField>
        </div>
        <DialogFooter>
          {pending.length > 0 && (
            <p role="status" className="mr-auto text-xs text-muted-foreground">
              Preencha {pending.join(', ')} para iniciar o apontamento.
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={!form.orderId || !form.operationName || !form.operator}>
            <Play className="h-4 w-4 mr-2" /> Iniciar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
