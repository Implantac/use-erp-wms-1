import { useConfirm } from '@/shared/components/confirmContext';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, HeartPulse, Trash2, ChevronRight, Calendar, Stethoscope } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Textarea } from '@/ui/base/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Badge } from '@/ui/base/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  useHealthPatients, useCreateHealthPatient, useDeleteHealthPatient,
  useHealthProfessionals, useCreateHealthProfessional,
  useHealthAppointments, useCreateHealthAppointment, useUpdateAppointmentStatus,
} from '@/hooks/useHealth';

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada', confirmed: 'Confirmada', done: 'Realizada',
  canceled: 'Cancelada', no_show: 'Faltou',
};

export default function HealthPatients() {
  const confirm = useConfirm();
  const { data: patients = [], isLoading } = useHealthPatients();
  const { data: pros = [] } = useHealthProfessionals();
  const { data: appts = [] } = useHealthAppointments();
  const createPatient = useCreateHealthPatient();
  const deletePatient = useDeleteHealthPatient();
  const createPro = useCreateHealthProfessional();
  const createAppt = useCreateHealthAppointment();
  const updStatus = useUpdateAppointmentStatus();

  const [tab, setTab] = useState('patients');
  const [openPatient, setOpenPatient] = useState(false);
  const [openPro, setOpenPro] = useState(false);
  const [openAppt, setOpenAppt] = useState(false);

  const [pf, setPf] = useState({ full_name: '', cpf: '', birth_date: '', gender: '', phone: '', email: '', notes: '' });
  const [prof, setProf] = useState({ full_name: '', registry_number: '', specialty: '', email: '', phone: '' });
  const [af, setAf] = useState({ patient_id: '', professional_id: '', scheduled_at: '', reason: '' });

  const submitPatient = async () => {
    await createPatient.mutateAsync({
      full_name: pf.full_name, cpf: pf.cpf || null, birth_date: pf.birth_date || null,
      gender: pf.gender || null, phone: pf.phone || null, email: pf.email || null, notes: pf.notes || null,
    });
    setPf({ full_name: '', cpf: '', birth_date: '', gender: '', phone: '', email: '', notes: '' });
    setOpenPatient(false);
  };
  const submitPro = async () => {
    await createPro.mutateAsync({
      full_name: prof.full_name, registry_number: prof.registry_number || null,
      specialty: prof.specialty || null, email: prof.email || null, phone: prof.phone || null,
    });
    setProf({ full_name: '', registry_number: '', specialty: '', email: '', phone: '' });
    setOpenPro(false);
  };
  const submitAppt = async () => {
    await createAppt.mutateAsync({
      patient_id: af.patient_id,
      professional_id: af.professional_id || null,
      scheduled_at: new Date(af.scheduled_at).toISOString(),
      reason: af.reason || null,
    });
    setAf({ patient_id: '', professional_id: '', scheduled_at: '', reason: '' });
    setOpenAppt(false);
  };

  const upcoming = appts.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length;

  return (
    <PageContainer>
      <PageHeader
        title="Saúde"
        description="Pacientes, profissionais e consultas"
        icon={HeartPulse}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pacientes</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{patients.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Profissionais</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{pros.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Consultas pendentes</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{upcoming}</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="patients">Pacientes</TabsTrigger>
          <TabsTrigger value="professionals">Profissionais</TabsTrigger>
          <TabsTrigger value="appointments">Consultas</TabsTrigger>
        </TabsList>

        {/* PACIENTES */}
        <TabsContent value="patients">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Pacientes</CardTitle>
              <Dialog open={openPatient} onOpenChange={setOpenPatient}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo paciente</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo paciente</DialogTitle></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div><Label>Nome completo</Label><Input value={pf.full_name} onChange={e => setPf({ ...pf, full_name: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>CPF</Label><Input value={pf.cpf} onChange={e => setPf({ ...pf, cpf: e.target.value })} /></div>
                      <div><Label>Data de nascimento</Label><Input type="date" value={pf.birth_date} onChange={e => setPf({ ...pf, birth_date: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Gênero</Label>
                        <Select value={pf.gender} onValueChange={v => setPf({ ...pf, gender: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="F">Feminino</SelectItem>
                            <SelectItem value="M">Masculino</SelectItem>
                            <SelectItem value="O">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Telefone</Label><Input value={pf.phone} onChange={e => setPf({ ...pf, phone: e.target.value })} /></div>
                    </div>
                    <div><Label>E-mail</Label><Input type="email" value={pf.email} onChange={e => setPf({ ...pf, email: e.target.value })} /></div>
                    <div><Label>Observações</Label><Textarea value={pf.notes} onChange={e => setPf({ ...pf, notes: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenPatient(false)}>Cancelar</Button>
                    <Button onClick={submitPatient} disabled={!pf.full_name || createPatient.isPending}>Cadastrar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando…</div>
              ) : patients.length === 0 ? (
                <EmptyState icon={HeartPulse} title="Nenhum paciente" description="Cadastre pacientes para gerenciar prontuários, consultas e histórico clínico." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>Telefone</TableHead><TableHead>E-mail</TableHead><TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patients.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell className="font-mono text-sm">{p.cpf || '—'}</TableCell>
                        <TableCell>{p.phone || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{p.email || '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild variant="ghost" size="icon"><Link to={`/saude/pacientes/${p.id}`}><ChevronRight className="h-4 w-4" /></Link></Button>
                            <Button variant="ghost" size="icon" onClick={async () => { if (await confirm({ title: 'Excluir paciente?', description: `O paciente ${p.full_name} será excluído.`, confirmLabel: 'Excluir', variant: 'destructive' })) deletePatient.mutate(p.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROFISSIONAIS */}
        <TabsContent value="professionals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Profissionais</CardTitle>
              <Dialog open={openPro} onOpenChange={setOpenPro}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo profissional</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo profissional</DialogTitle></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div><Label>Nome</Label><Input value={prof.full_name} onChange={e => setProf({ ...prof, full_name: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Registro (CRM/CRO/etc.)</Label><Input value={prof.registry_number} onChange={e => setProf({ ...prof, registry_number: e.target.value })} /></div>
                      <div><Label>Especialidade</Label><Input value={prof.specialty} onChange={e => setProf({ ...prof, specialty: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>E-mail</Label><Input type="email" value={prof.email} onChange={e => setProf({ ...prof, email: e.target.value })} /></div>
                      <div><Label>Telefone</Label><Input value={prof.phone} onChange={e => setProf({ ...prof, phone: e.target.value })} /></div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenPro(false)}>Cancelar</Button>
                    <Button onClick={submitPro} disabled={!prof.full_name || createPro.isPending}>Cadastrar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              {pros.length === 0 ? (
                <EmptyState icon={Stethoscope} title="Nenhum profissional" description="Cadastre médicos e profissionais de saúde para agendar consultas." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Nome</TableHead><TableHead>Registro</TableHead><TableHead>Especialidade</TableHead><TableHead>Contato</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {pros.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell className="font-mono text-sm">{p.registry_number || '—'}</TableCell>
                        <TableCell>{p.specialty || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{p.phone || p.email || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONSULTAS */}
        <TabsContent value="appointments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Consultas</CardTitle>
              <Dialog open={openAppt} onOpenChange={setOpenAppt}>
                <DialogTrigger asChild><Button size="sm" disabled={patients.length === 0}><Plus className="h-4 w-4 mr-2" />Agendar</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Agendar consulta</DialogTitle></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div><Label>Paciente</Label>
                      <Select value={af.patient_id} onValueChange={v => setAf({ ...af, patient_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Profissional</Label>
                      <Select value={af.professional_id} onValueChange={v => setAf({ ...af, professional_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{pros.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Data e hora</Label><Input type="datetime-local" value={af.scheduled_at} onChange={e => setAf({ ...af, scheduled_at: e.target.value })} /></div>
                    <div><Label>Motivo</Label><Textarea value={af.reason} onChange={e => setAf({ ...af, reason: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenAppt(false)}>Cancelar</Button>
                    <Button onClick={submitAppt} disabled={!af.patient_id || !af.scheduled_at || createAppt.isPending}>Agendar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              {appts.length === 0 ? (
                <EmptyState icon={Calendar} title="Nenhuma consulta" description="Agende consultas vinculando pacientes e profissionais cadastrados." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Data</TableHead><TableHead>Paciente</TableHead><TableHead>Profissional</TableHead><TableHead>Status</TableHead><TableHead className="w-48"></TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {appts.map(a => {
                      const patient = patients.find(p => p.id === a.patient_id);
                      const pro = pros.find(p => p.id === a.professional_id);
                      return (
                        <TableRow key={a.id}>
                          <TableCell>{new Date(a.scheduled_at).toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="font-medium">{patient?.full_name || '—'}</TableCell>
                          <TableCell>{pro?.full_name || '—'}</TableCell>
                          <TableCell><Badge variant={a.status === 'done' ? 'default' : a.status === 'canceled' || a.status === 'no_show' ? 'destructive' : 'secondary'}>{STATUS_LABEL[a.status] || a.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <Select value={a.status} onValueChange={(v) => updStatus.mutate({ id: a.id, status: v })}>
                              <SelectTrigger className="h-8 w-36 ml-auto"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
