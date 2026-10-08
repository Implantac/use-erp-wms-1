import { Info, Sparkles } from 'lucide-react';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';

interface Props {
  operationType: string;
  setOperationType: (v: string) => void;
  naturezaOp: string;
  setNaturezaOp: (v: string) => void;
  defaultCfop: string;
  setDefaultCfop: (v: string) => void;
}

export function StepInfo({ operationType, setOperationType, naturezaOp, setNaturezaOp, defaultCfop, setDefaultCfop }: Props) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Info className="h-5 w-5" />
            <h3 className="font-bold uppercase tracking-wider text-xs">Informações da Operação</h3>
          </div>
          <div className="space-y-2">
            <Label>Tipo de Movimentação</Label>
            <Select value={operationType} onValueChange={setOperationType}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saida">Saída (Venda/Remessa)</SelectItem>
                <SelectItem value="entrada">Entrada (Compra/Devolução)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Natureza da Operação</Label>
            <Input value={naturezaOp} onChange={(e) => setNaturezaOp(e.target.value)} className="h-12" placeholder="Ex: Venda de mercadoria" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <h3 className="font-bold uppercase tracking-wider text-xs">Configuração Inteligente</h3>
          </div>
          <div className="bg-muted/50 p-5 rounded-xl border border-dashed border-primary/20 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">CFOP para novos itens (opcional)</Label>
              <Input value={defaultCfop} maxLength={4} inputMode="numeric" pattern="[1-7][0-9]{3}" placeholder="Informe o CFOP após análise fiscal" onChange={(e) => setDefaultCfop(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              * O CFOP deve ser selecionado por operação e item; UF isolada não determina o código. Confirme com o responsável fiscal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
