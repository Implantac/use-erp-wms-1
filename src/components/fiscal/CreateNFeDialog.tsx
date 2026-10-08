import { Dialog, DialogContent } from '@/ui/base/dialog';
import { ScrollArea } from '@/ui/base/scroll-area';
import { FiscalStepper } from './FiscalStepper';
import { STEPS } from './createNFe/types';
import { useCreateNFeState } from './createNFe/useCreateNFeState';
import { CreateNFeHeader } from './createNFe/CreateNFeHeader';
import { CreateNFeFooter } from './createNFe/CreateNFeFooter';
import { CreateNFeStepContent } from './createNFe/CreateNFeStepContent';

interface CreateNFeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    clientName: string;
    clientId?: string;
    clientDocument?: string;
    operationType: string;
    items: { productCode: string; productName: string; productId?: string; quantity: number; unitPrice: number; unit?: string; ncm?: string; cfop?: string; ibs?: number; cbs?: number; ipi?: number; pis?: number; cofins?: number }[];
    discount?: number;
    shipping?: number;
  }) => Promise<any>;
}

export function CreateNFeDialog({ open, onOpenChange, onCreate }: CreateNFeDialogProps) {
  const state = useCreateNFeState();

  const handleNext = () => {
    if (state.hasBlockingErrors) return;
    state.setStep(Math.min(state.step + 1, STEPS.length - 1));
  };
  const handlePrev = () => state.setStep(Math.max(state.step - 1, 0));

  const handleSubmit = async () => {
    if (state.hasAnyBlockingErrors) return;
    state.setSaving(true);
    try {
    await onCreate({
      clientName: state.clientName,
      clientId: state.clientId || undefined,
      clientDocument: state.clientDocument || undefined,
      operationType: state.operationType,
      items: state.items.map((i) => ({
        productCode: i.productCode,
        productName: i.productName,
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unit: i.unit,
        ncm: i.ncm,
        cfop: i.cfop,
        ipi: i.ipi,
        pis: i.pis,
        cofins: i.cofins,
        ibs: i.ibs,
        cbs: i.cbs,
      })),
      discount: state.discount,
      shipping: state.shipping,
    });
    onOpenChange(false);
    state.setStep(0);
    } finally {
      state.setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden p-0 flex flex-col">
        <CreateNFeHeader
          allIssues={state.allIssues}
          validationByStep={state.validationByStep}
          searchTerm={state.searchTerm}
          setSearchTerm={state.setSearchTerm}
          diagnosisFilter={state.diagnosisFilter}
          setDiagnosisFilter={state.setDiagnosisFilter}
          diagnosisSearch={state.diagnosisSearch}
          hasFilteredErrors={state.hasFilteredErrors}
          hasFilteredWarnings={state.hasFilteredWarnings}
          nothingFoundInView={state.nothingFoundInView}
          onStepClick={state.setStep}
        />

        <div className="px-10 py-6 border-b">
          <FiscalStepper steps={STEPS} currentStep={state.step} onStepClick={state.setStep} />
        </div>

        <div className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full">
            <CreateNFeStepContent s={state.step} state={state} />
          </ScrollArea>
        </div>

        <CreateNFeFooter
          step={state.step}
          saving={state.saving}
          hasBlockingErrors={state.step === STEPS.length - 1 ? state.hasAnyBlockingErrors : state.hasBlockingErrors}
          onPrev={handlePrev}
          onNext={handleNext}
          onSubmit={handleSubmit}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
