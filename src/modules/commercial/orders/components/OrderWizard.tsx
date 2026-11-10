import { useState, useMemo } from 'react';
import { 
  User, 
  Package, 
  CreditCard, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Info,
  Truck,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';
import { Progress } from '@/ui/base/progress';
import { ClientSelector } from '@/components/commercial/ClientSelector';
import { OrderItemsEditor, type LineItem } from '@/components/commercial/OrderItemsEditor';
import { useOrderProfitability } from '@/hooks/commercial/useOrderProfitability';
import { useCreditCheck } from '@/hooks/commercial/useCreditCheck';
import { formatBRL } from '@/lib/formatters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Label } from '@/ui/base/label';
import { Input } from '@/ui/base/input';
import { Textarea } from '@/ui/base/textarea';
import { Badge } from '@/ui/base/badge';
import { Separator } from '@/ui/base/separator';
import { ProfitabilityCard } from '../ProfitabilityCard';
import { CreditBadge } from '../CreditBadge';
import { useCreateOrder } from '@/hooks/commercial/orders/useCreateOrder';
import { OperationalFeedback } from '@/components/shared/OperationalFeedback';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 'client', title: 'Cliente & Origem', icon: User },
  { id: 'items', title: 'Itens do Pedido', icon: Package },
  { id: 'payment', title: 'Pagamento & Entrega', icon: CreditCard },
  { id: 'review', title: 'Revisão & Margem', icon: CheckCircle2 },
];

interface OrderWizardProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function OrderWizard({ onSuccess, onCancel }: OrderWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formClient, setFormClient] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  const [formItems, setFormItems] = useState<LineItem[]>([]);
  const [formPayment, setFormPayment] = useState('cash');
  const [formCondition, setFormCondition] = useState('À vista');
  const [formPriority, setFormPriority] = useState('medium');
  const [formDelivery, setFormDelivery] = useState('');
  const [formShipping, setFormShipping] = useState('0');
  const [formNotes, setFormNotes] = useState('');

  const createOrder = useCreateOrder();

  const orderTotal = useMemo(() => 
    formItems.reduce((s, i) => s + (i.quantity * i.unit_price - i.discount), 0) + (Number(formShipping) || 0)
  , [formItems, formShipping]);

  const profitability = useOrderProfitability(formItems, Number(formShipping) || 0);
  const credit = useCreditCheck(formClient.id, orderTotal);

  const canGoNext = () => {
    if (currentStep === 0) return !!formClient.id;
    if (currentStep === 1) return formItems.length > 0 && formItems.every(i => i.product_id && i.quantity > 0);
    if (currentStep === 2) return !!formPayment && !!formCondition;
    return true;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  /** QA-UX r6: "Próximo Passo" travado precisa dizer O QUE falta. */
  const nextHint = (): string | null => {
    if (canGoNext()) return null;
    if (currentStep === 0) return 'Selecione um cliente para avançar para os itens.';
    if (currentStep === 1) return 'Adicione ao menos um item com produto e quantidade para avançar.';
    if (currentStep === 2) return 'Selecione a forma de pagamento e a condição para avançar.';
    return null;
  };

  const handleSubmit = () => {
    createOrder.mutate({
      client_id: formClient.id,
      client_name: formClient.name,
      items: formItems as any,
      payment_method: formPayment,
      payment_condition: formCondition,
      priority: formPriority,
      delivery_date: formDelivery,
      shipping: Number(formShipping),
      notes: formNotes,
    }, {
      onSuccess: () => {
        onSuccess?.();
      }
    });
  };

  const progressValue = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="space-y-2">
        <div className="flex justify-between items-end px-1">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Novo Pedido de Venda</h2>
            <p className="text-muted-foreground text-sm">
              Passo {currentStep + 1} de {STEPS.length}: {STEPS[currentStep].title}
            </p>
          </div>
          <Badge variant="outline" className="h-6 font-mono text-[10px] uppercase">
            Wizard O2C-PRO
          </Badge>
        </div>
        <Progress value={progressValue} className="h-2" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isActive = idx === currentStep;
          const isDone = idx < currentStep;
          return (
            <div 
              key={step.id} 
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border transition-all",
                isActive ? "bg-primary/10 border-primary text-primary shadow-sm" : 
                isDone ? "bg-muted/50 border-muted text-muted-foreground" : 
                "bg-background border-border text-muted-foreground opacity-50"
              )}
            >
              <div className={cn(
                "p-2 rounded-lg",
                isActive ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                <StepIcon className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider leading-none">
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      <div className="min-h-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        {currentStep === 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" /> Seleção de Cliente & Sourcing
              </CardTitle>
              <CardDescription>Identifique o cliente e a unidade operacional de origem.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ClientSelector 
                clientId={formClient.id} 
                clientName={formClient.name} 
                onSelect={setFormClient} 
              />
              
              <div className="p-4 rounded-lg bg-background border border-border space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-primary uppercase tracking-tight">
                  <ShieldCheck className="h-4 w-4" /> Inteligência de Sourcing
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O sistema selecionará automaticamente a unidade com melhor nível de serviço para o cliente selecionado.
                  Certifique-se de que o endereço do cliente esteja atualizado para cálculo de frete e lead-time.
                </p>
              </div>

              {formClient.id && (
                <OperationalFeedback 
                  type="info" 
                  title="Cliente Identificado" 
                  message={`Operação configurada para ${formClient.name}. Prossiga para adicionar itens.`} 
                />
              )}
            </CardContent>
          </Card>
        )}

        {currentStep === 1 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" /> Composição do Carrinho
              </CardTitle>
              <CardDescription>Selecione os produtos e valide a disponibilidade imediata (ATP).</CardDescription>
            </CardHeader>
            <CardContent>
              <OrderItemsEditor 
                items={formItems} 
                onChange={setFormItems} 
                dueDate={formDelivery || null} 
              />
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Pagamento & Logística
              </CardTitle>
              <CardDescription>Defina as condições financeiras e detalhes de entrega.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Forma de Pagamento</Label>
                  <Select value={formPayment} onValueChange={setFormPayment}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Dinheiro</SelectItem>
                      <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                      <SelectItem value="debit_card">Cartão de Débito</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="transfer">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Condição</Label>
                  <Select value={formCondition} onValueChange={setFormCondition}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="À vista">À vista</SelectItem>
                      <SelectItem value="30 dias">30 dias</SelectItem>
                      <SelectItem value="30/60 dias">30/60 dias</SelectItem>
                      <SelectItem value="30/60/90 dias">30/60/90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prioridade</Label>
                  <Select value={formPriority} onValueChange={setFormPriority}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Data de Entrega</Label>
                  <Input 
                    type="date" 
                    className="bg-background"
                    value={formDelivery} 
                    onChange={(e) => setFormDelivery(e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Frete (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    className="bg-background"
                    value={formShipping} 
                    onChange={(e) => setFormShipping(e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notas Internas</Label>
                <Textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Instruções para o WMS ou Logística..."
                  rows={4}
                  className="bg-background"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" /> Revisão de Crédito
                  </CardTitle>
                </CardHeader>
                <CardContent>
                   <CreditBadge result={credit.data} loading={credit.isLoading} />
                   <div className="mt-4 p-4 rounded-lg bg-background border space-y-2">
                     <div className="flex justify-between text-sm">
                       <span className="text-muted-foreground">Valor do Pedido:</span>
                       <span className="font-bold">{formatBRL(orderTotal)}</span>
                     </div>
                     <Separator />
                     <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1">
                       <Info className="h-3 w-3" /> Política de Risco Ativa
                     </div>
                   </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" /> Margem & Impostos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProfitabilityCard data={profitability.data} loading={profitability.isLoading} />
                </CardContent>
              </Card>
            </div>

            <Card className="border-primary/20 bg-background overflow-hidden">
              <div className="bg-primary/10 px-6 py-4 border-b border-primary/20 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  <span className="font-black uppercase tracking-wider text-sm">Resumo Operacional</span>
                </div>
                <Badge className="bg-primary">{formItems.length} Itens</Badge>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Origem</p>
                  <p className="font-bold text-sm">Automática (Best-Sourcing)</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Destino</p>
                  <p className="font-bold text-sm truncate">{formClient.name}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Líquido</p>
                  <p className="text-2xl font-black text-primary">{formatBRL(orderTotal)}</p>
                </div>
              </CardContent>
            </Card>

            {profitability.data && profitability.data.marginPct < 10 && (
              <OperationalFeedback 
                type="warning" 
                title="Margem de Segurança" 
                message="Este pedido possui margem líquida abaixo de 10%. A aprovação pode exigir autorização do gerente regional." 
              />
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center pt-6 border-t border-border mt-8">
        <Button 
          variant="outline" 
          onClick={currentStep === 0 ? onCancel : handleBack}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {currentStep === 0 ? 'Cancelar' : 'Voltar'}
        </Button>
        
        <div className="flex items-center gap-3">
          {nextHint() && (
            <span role="status" className="max-w-[260px] text-right text-xs text-muted-foreground">
              {nextHint()}
            </span>
          )}
          <Button 
            onClick={handleNext}
            disabled={!canGoNext() || createOrder.isPending}
            className="gap-2 min-w-[140px]"
          >
            {createOrder.isPending ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                {currentStep === STEPS.length - 1 ? 'Finalizar Pedido' : 'Próximo Passo'}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

