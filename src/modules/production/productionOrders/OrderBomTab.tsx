import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Trash2, Plus, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface Props { productId: string | null; quantity: number }

export function OrderBomTab({ productId, quantity }: Props) {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  const qc = useQueryClient();
  const [componentId, setComponentId] = useState('');
  const [qty, setQty] = useState('1');
  const [waste, setWaste] = useState('0');
  const key = ['production_bom', companyId, productId];

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: key,
    enabled: !!companyId && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.from('production_bom')
        .select('id, quantity, waste_percentage, component:products!production_bom_component_id_fkey(id, code, name, unit)')
        .eq('company_id', companyId!).eq('product_id', productId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['bom-products', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, code, name').eq('company_id', companyId!).order('name').limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const q = Number(qty.replace(',', '.')); const w = Number(waste.replace(',', '.'));
      if (!componentId || !(q > 0) || w < 0) throw new Error('Escolha o material e informe quantidade maior que zero.');
      if (componentId === productId) throw new Error('O produto não pode consumir a si mesmo.');
      const { error } = await supabase.from('production_bom').insert({ company_id: companyId!, product_id: productId!, component_id: componentId, quantity: q, waste_percentage: w });
      if (error) throw new Error(error.code === '23505' ? 'Este material já está na ficha.' : error.message);
    },
    onSuccess: () => { setComponentId(''); setQty('1'); setWaste('0'); qc.invalidateQueries({ queryKey: key }); toast.success('Material adicionado à ficha'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('production_bom').delete().eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Material removido'); },
    onError: () => toast.error('Não foi possível remover. Apenas gestores podem alterar a ficha.'),
  });

  if (!productId) return <p className="py-6 text-sm text-muted-foreground">Esta OP não tem produto vinculado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>Ficha para estimar materiais. O cadastro não reserva nem baixa estoque. A conclusão da OP permanece bloqueada até consumo transacional, qualidade e rastreabilidade homologados.</p>
      </div>

      {error ? <p className="text-sm text-destructive">Não foi possível carregar a ficha de materiais.</p>
        : isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" />
        : items.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum material cadastrado. Não libere a produção sem revisar a ficha técnica e a rota.</p>
        : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((it: any) => {
              const total = it.quantity * quantity * (1 + (it.waste_percentage ?? 0) / 100);
              return (
                <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{it.component?.name ?? 'Material removido'}</p>
                    <p className="text-xs text-muted-foreground">{it.component?.code} · {it.quantity} por peça · perda {it.waste_percentage ?? 0}%</p>
                  </div>
                  <span className="tabular-nums text-foreground">{total.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {it.component?.unit ?? ''}</span>
                  <Button variant="ghost" size="icon" aria-label="Remover material" onClick={() => remove.mutate(it.id)} disabled={remove.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

      <div className="grid gap-2 sm:grid-cols-[1fr_100px_90px_auto]">
        <Select value={componentId} onValueChange={setComponentId}>
          <SelectTrigger aria-label="Material"><SelectValue placeholder="Escolha o material" /></SelectTrigger>
          <SelectContent>
            {products.filter((p) => p.id !== productId).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input aria-label="Quantidade por peça" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qtd/peça" />
        <Input aria-label="Perda em %" inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} placeholder="Perda %" />
        <Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4" />Adicionar</Button>
      </div>
    </div>
  );
}
