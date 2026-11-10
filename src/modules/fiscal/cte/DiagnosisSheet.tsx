import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/ui/base/sheet';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { ScrollArea } from '@/ui/base/scroll-area';
import { HighlightText } from '@/shared/components/HighlightText';
import { AlertCircle, AlertTriangle, CheckCircle2, ListChecks, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEPS, type StepValidation } from './constants';

interface Props {
  validationByStep: StepValidation;
  totalIssues: number;
  diagnosisSearch: string;
  setDiagnosisSearch: (v: string) => void;
  setStep: (i: number) => void;
}

export function DiagnosisSheet({ validationByStep, totalIssues, diagnosisSearch, setDiagnosisSearch, setStep }: Props) {
  const q = diagnosisSearch.toLowerCase();
  const noResults = totalIssues === 0 || (diagnosisSearch && !STEPS.some((_, idx) =>
    validationByStep[idx].errors.some((err) => err.toLowerCase().includes(q)) ||
    validationByStep[idx].warnings.some((warn) => warn.toLowerCase().includes(q))
  ));

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-2', totalIssues > 0 ? 'border-warning text-warning-text hover:bg-warning/5' : 'border-success text-success hover:bg-success/5')}>
          <ListChecks className="h-4 w-4" />
          Inconsistências ({totalIssues})
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning-text" />
            Diagnóstico de CT-e
          </SheetTitle>
          <SheetDescription>Resumo das validações pendentes para a emissão do CT-e.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filtrar por texto das inconsistências..." className="pl-9" value={diagnosisSearch} onChange={(e) => setDiagnosisSearch(e.target.value)} />
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-210px)] mt-6 pr-4">
          <div className="space-y-6">
            {STEPS.map((s, idx) => {
              const stepIssues = validationByStep[idx];
              const filteredErrors = stepIssues.errors.filter((err) => err.toLowerCase().includes(q));
              const filteredWarnings = stepIssues.warnings.filter((warn) => warn.toLowerCase().includes(q));
              if (filteredErrors.length === 0 && filteredWarnings.length === 0) return null;
              return (
                <div key={idx} className="space-y-3">
                  <div className="flex items-center gap-2 border-b pb-1">
                    <Badge variant="outline" className="w-6 h-6 rounded-full p-0 flex items-center justify-center">{idx + 1}</Badge>
                    <h4 className="text-sm font-bold uppercase tracking-wider">{s.label}</h4>
                    <Button variant="ghost" size="sm" onClick={() => setStep(idx)} className="ml-auto text-[10px] h-6">Corrigir</Button>
                  </div>
                  {filteredErrors.map((err, i) => (
                    <div key={`err-${idx}-${i}`} className="flex gap-2 text-xs text-destructive bg-destructive/5 p-2 rounded-md">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span><HighlightText text={err} search={diagnosisSearch} /></span>
                    </div>
                  ))}
                  {filteredWarnings.map((warn, i) => (
                    <div key={`warn-${idx}-${i}`} className="flex gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded-md">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span><HighlightText text={warn} search={diagnosisSearch} /></span>
                    </div>
                  ))}
                </div>
              );
            })}
            {noResults && (
              <div className="py-20 text-center space-y-3">
                {diagnosisSearch ? (
                  <>
                    <Search className="h-12 w-12 mx-auto text-muted-foreground opacity-20" />
                    <p className="text-sm text-muted-foreground font-medium">Nenhum resultado para "{diagnosisSearch}"</p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-12 w-12 mx-auto text-success opacity-20" />
                    <p className="text-sm text-muted-foreground font-medium">Nenhuma inconsistência detectada!</p>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
