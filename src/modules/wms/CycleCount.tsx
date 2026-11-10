import { usePrompt } from '@/shared/components/confirmContext';
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Badge } from "@/ui/base/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/ui/base/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/base/table";
import { ClipboardCheck, Plus, Play, CheckCircle2, AlertTriangle, ListChecks } from "lucide-react";
import { EmptyState } from "@/shared/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { toastSuccess, toastError } from "@/lib/toastHelpers";

type CountRow = {
  id: string;
  count_number: string;
  zone: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduled_date: string;
  started_at: string | null;
  completed_at: string | null;
  items_count: number;
  discrepancies: number;
  operator: string | null;
};

const statusLabel: Record<CountRow["status"], string> = {
  scheduled: "Agendado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const statusVariant: Record<CountRow["status"], "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "outline",
  in_progress: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export default function CycleCount() {
  const ask = usePrompt();
  const [rows, setRows] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    count_number: "",
    zone: "",
    scheduled_date: new Date().toISOString().slice(0, 10),
    operator: "",
    items_count: 0,
  });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("wms_inventory_counts")
      .select("*")
      .order("scheduled_date", { ascending: false })
      .limit(200);
    if (error) {
      toastError("Erro ao carregar inventários", error.message);
    } else {
      setRows((data ?? []) as CountRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const kpis = useMemo(() => {
    const total = rows.length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const totalItems = rows.reduce((a, r) => a + (r.items_count ?? 0), 0);
    const totalDisc = rows.reduce((a, r) => a + (r.discrepancies ?? 0), 0);
    const accuracy = totalItems > 0 ? ((totalItems - totalDisc) / totalItems) * 100 : 100;
    return { total, inProgress, completed, accuracy };
  }, [rows]);

  async function createCount() {
    if (!form.count_number.trim()) {
      toastError("Informe o número do inventário");
      return;
    }
    const { error } = await supabase.from("wms_inventory_counts").insert({
      count_number: form.count_number,
      zone: form.zone || null,
      scheduled_date: form.scheduled_date,
      operator: form.operator || null,
      items_count: Number(form.items_count) || 0,
      discrepancies: 0,
      status: "scheduled",
    });
    if (error) {
      toastError("Erro ao criar inventário", error.message);
      return;
    }
    toastSuccess("Inventário criado");
    setOpen(false);
    setForm({ count_number: "", zone: "", scheduled_date: new Date().toISOString().slice(0, 10), operator: "", items_count: 0 });
    load();
  }

  async function start(id: string) {
    const { error } = await supabase
      .from("wms_inventory_counts")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toastError("Erro ao iniciar", error.message);
    toastSuccess("Inventário iniciado");
    load();
  }

  async function complete(id: string, discrepancies: number) {
    const { error } = await supabase
      .from("wms_inventory_counts")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        discrepancies: Math.max(0, Math.floor(discrepancies)),
      })
      .eq("id", id);
    if (error) return toastError("Erro ao concluir", error.message);
    toastSuccess("Inventário concluído");
    load();
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" /> Inventário Cíclico
          </h1>
          <p className="text-muted-foreground">
            Programe contagens por zona, acompanhe execução e meça acuracidade.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Novo Inventário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Inventário Cíclico</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Número *</Label>
                <Input
                  value={form.count_number}
                  onChange={(e) => setForm({ ...form, count_number: e.target.value })}
                  placeholder="INV-2026-0001"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Zona</Label>
                  <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="A-01" />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.scheduled_date}
                    onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Operador</Label>
                  <Input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
                </div>
                <div>
                  <Label>Itens previstos</Label>
                  <Input
                    type="number"
                    value={form.items_count}
                    onChange={(e) => setForm({ ...form, items_count: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={createCount}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Em andamento</CardTitle>
            <Play className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Acuracidade</CardTitle>
            <AlertTriangle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.accuracy.toFixed(2)}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventários</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              icon={ClipboardCheck}
              title="Nenhum inventário cadastrado"
              description="Agende um inventário cíclico para iniciar contagens por zona."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Divergências</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.count_number}</TableCell>
                    <TableCell>{r.zone ?? "—"}</TableCell>
                    <TableCell>{new Date(r.scheduled_date).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{r.operator ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.items_count}</TableCell>
                    <TableCell className="text-right">{r.discrepancies}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[r.status]}>{statusLabel[r.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {r.status === "scheduled" && (
                        <Button size="sm" variant="outline" onClick={() => start(r.id)}>
                          Iniciar
                        </Button>
                      )}
                      {r.status === "in_progress" && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            const v = await ask({ title: 'Concluir contagem', description: 'Informe quantas divergências foram encontradas.', inputLabel: 'Divergências encontradas', defaultValue: '0', placeholder: '0', required: true, confirmLabel: 'Concluir' });
                            if (v !== null) complete(r.id, Number(v) || 0);
                          }}
                        >
                          Concluir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
