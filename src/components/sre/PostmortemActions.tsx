import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Badge } from '@/ui/base/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Plus, Trash2, CheckCircle2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Action {
  id: string;
  title: string;
  description?: string | null;
  owner_id?: string | null;
  due_at?: string | null;
  status: string;
  priority: string;
  completed_at?: string | null;
}

const PRIORITY_VARIANT: Record<string, 'secondary' | 'default' | 'destructive' | 'outline'> = {
  low: 'outline', medium: 'secondary', high: 'default', critical: 'destructive',
};
const STATUS_VARIANT: Record<string, 'secondary' | 'default' | 'outline'> = {
  open: 'outline', in_progress: 'default', done: 'secondary', cancelled: 'secondary',
};

export function PostmortemActions({ postmortemId }: { postmortemId: string }) {
  const [items, setItems] = useState<Action[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', owner_id: '', due_at: '', priority: 'medium' });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: profs }] = await Promise.all([
      supabase.from('sre_postmortem_actions').select('*').eq('postmortem_id', postmortemId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name').limit(100),
    ]);
    setItems((data ?? []) as unknown as Action[]);
    setUsers((profs ?? []) as Array<{ id: string; name?: string | null }>);
    setLoading(false);
  }, [postmortemId]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!form.title) { toast.error('Título obrigatório'); return; }
    const { error } = await supabase.rpc('sre_postmortem_action_upsert', {
      _id: null,
      _postmortem_id: postmortemId,
      _title: form.title,
      _description: null,
      _owner_id: form.owner_id || null,
      _due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      _priority: form.priority,
    });
    if (error) { toast.error(error.message); return; }
    setForm({ title: '', owner_id: '', due_at: '', priority: 'medium' });
    toast.success('Ação registrada');
    load();
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.rpc('sre_postmortem_action_set_status', { _id: id, _status: status });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('sre_postmortem_actions').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-5 items-end">
        <div className="md:col-span-2"><Label>Ação</Label>
          <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Adicionar alerta de burn rate" />
        </div>
        <div>
          <Label>Responsável</Label>
          <Select value={form.owner_id} onValueChange={v => setForm({ ...form, owner_id: v })}>
            <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name || u.id.slice(0, 8)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Prazo</Label><Input type="datetime-local" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} /></div>
        <div><Label>Prior.</Label>
          <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="critical">Crítica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-5"><Button onClick={add} size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar action item</Button></div>
      </div>

      {loading ? <p className="text-xs text-muted-foreground">Carregando…</p> : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma ação cadastrada.</p>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ação</TableHead><TableHead>Prior.</TableHead><TableHead>Prazo</TableHead>
            <TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {items.map(a => {
              const overdue = a.due_at && new Date(a.due_at) < new Date() && ['open', 'in_progress'].includes(a.status);
              return (
                <TableRow key={a.id}>
                  <TableCell className="max-w-[260px] truncate" title={a.title}>{a.title}</TableCell>
                  <TableCell><Badge variant={PRIORITY_VARIANT[a.priority] ?? 'secondary'}>{a.priority}</Badge></TableCell>
                  <TableCell className={`text-xs ${overdue ? 'text-destructive font-semibold' : ''}`}>
                    {a.due_at ? new Date(a.due_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[a.status] ?? 'outline'}>{a.status}</Badge></TableCell>
                  <TableCell className="flex gap-1 justify-end">
                    {a.status === 'open' && (
                      <Button size="icon" variant="ghost" title="Iniciar" onClick={() => setStatus(a.id, 'in_progress')}><PlayCircle className="h-4 w-4" /></Button>
                    )}
                    {a.status !== 'done' && (
                      <Button size="icon" variant="ghost" title="Concluir" onClick={() => setStatus(a.id, 'done')}><CheckCircle2 className="h-4 w-4" /></Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
