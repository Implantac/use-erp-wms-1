import { CheckCircle2 } from 'lucide-react';
import { Label } from '@/ui/base/label';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent } from '@/ui/base/card';
import { SmartSelect, SmartSelectOption } from '../SmartSelect';

interface Props {
  clientOptions: SmartSelectOption[];
  clientId: string;
  clientName: string;
  clientDocument: string;
  clientUF: string;
  onSelectClient: (id: string) => void;
}

export function StepClient({ clientOptions, clientId, clientName, clientDocument, clientUF, onSelectClient }: Props) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col items-center gap-6">
        <div className="w-full max-w-2xl space-y-4">
          <Label className="text-center block text-lg font-semibold">Quem é o destinatário desta nota?</Label>
          <SmartSelect
            options={clientOptions}
            value={clientId}
            onChange={onSelectClient}
            placeholder="Busque por Nome, CPF ou CNPJ..."
          />
        </div>

        {clientName && (
          <Card className="w-full max-w-3xl border-primary/20 bg-primary/5 shadow-lg overflow-hidden transition-all">
            <div className="bg-primary px-6 py-2 text-primary-foreground text-xs font-bold uppercase tracking-widest flex items-center justify-between">
              <span>Cliente Selecionado</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Razão Social / Nome</Label>
                <p className="font-bold text-lg">{clientName}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Documento</Label>
                <p className="font-mono">{clientDocument}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Estado (UF)</Label>
                <div className="flex items-center gap-2">
                  <Badge className="font-bold">{clientUF}</Badge>
                  {clientUF !== 'SP' && <Badge variant="secondary" className="text-[10px] bg-warning/20 text-warning-text border-warning">Interestadual</Badge>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
