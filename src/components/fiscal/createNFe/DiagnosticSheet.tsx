import { AlertCircle, AlertTriangle, CheckCircle2, ListChecks, Search, X } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import { ScrollArea } from '@/ui/base/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/base/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { SearchHint } from '@/shared/components/SearchHint';
import { HighlightText } from '@/shared/components/HighlightText';
import { cn } from '@/lib/utils';
import { STEPS } from './types';

interface Issue { errors: string[]; warnings: string[] }

interface Props {
  allIssues: { errors: { step: number; message: string }[]; warnings: { step: number; message: string }[]; total: number };
  validationByStep: Record<number, Issue>;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  diagnosisFilter: 'all' | 'errors' | 'warnings';
  setDiagnosisFilter: (v: 'all' | 'errors' | 'warnings') => void;
  diagnosisSearch: string;
  hasFilteredErrors: boolean;
  hasFilteredWarnings: boolean;
  nothingFoundInView: boolean;
  onStepClick: (idx: number) => void;
}

const highlightText = (text: string, search: string) => <HighlightText text={text} search={search} />;

export function DiagnosticSheet({
  allIssues, validationByStep, searchTerm, setSearchTerm,
  diagnosisFilter, setDiagnosisFilter, diagnosisSearch,
  hasFilteredErrors, hasFilteredWarnings, nothingFoundInView, onStepClick,
}: Props) {
  return (
    <Sheet onOpenChange={(open) => {
      if (!open) {
        setSearchTerm('');
        setDiagnosisFilter('all');
      }
    }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-2', allIssues.total > 0 ? 'border-warning text-warning-text hover:bg-warning/5' : 'border-success text-success hover:bg-success/5')}>
          <ListChecks className="h-4 w-4" />
          Inconsistências ({allIssues.total})
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-[400px] sm:w-[540px]"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && (searchTerm || diagnosisFilter !== 'all')) {
            setSearchTerm('');
            setDiagnosisFilter('all');
            e.preventDefault();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning-text" />
            Diagnóstico de Emissão
          </SheetTitle>
          <SheetDescription>
            Resumo de todas as validações pendentes para a autorização da nota.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por texto das inconsistências..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {(searchTerm || diagnosisFilter !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 text-xs gap-1 border-dashed hover:border-solid transition-all"
                  onClick={() => {
                    setSearchTerm('');
                    setDiagnosisFilter('all');
                  }}
                >
                  <X className="h-3 w-3" />
                  Limpar
                </Button>
              )}
            </div>
            <SearchHint keys="Esc">
              para limpar a busca e voltar o filtro para Tudo
            </SearchHint>
          </div>

          <Tabs value={diagnosisFilter} onValueChange={(v: any) => setDiagnosisFilter(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all" className="text-xs">Tudo ({allIssues.total})</TabsTrigger>
              <TabsTrigger value="errors" className="text-xs">Erros ({allIssues.errors.length})</TabsTrigger>
              <TabsTrigger value="warnings" className="text-xs">Sugestões ({allIssues.warnings.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="h-[calc(100vh-210px)] pr-4">
          <div className="space-y-6">
            {(diagnosisFilter === 'all' || diagnosisFilter === 'errors') && hasFilteredErrors && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-destructive font-bold text-[10px] uppercase tracking-widest bg-destructive/5 p-2 rounded-t-lg border-b border-destructive/10">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Erros Críticos (Bloqueantes)
                </div>
                <div className="space-y-5 px-1">
                  {STEPS.map((s, idx) => {
                    const stepIssues = validationByStep[idx];
                    const filteredErrors = stepIssues.errors.filter(err =>
                      err.toLowerCase().includes(diagnosisSearch.toLowerCase())
                    );
                    if (filteredErrors.length === 0) return null;
                    return (
                      <div key={`err-group-${idx}`} className="space-y-2">
                        <div className="flex items-center gap-2 border-b border-dashed pb-1">
                          <Badge variant="outline" className="h-5 text-[10px] px-1.5">{s.label}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => onStepClick(idx)} className="ml-auto text-[10px] h-5">Corrigir</Button>
                        </div>
                        {filteredErrors.map((err, i) => (
                          <div key={`err-${idx}-${i}`} className="flex gap-2 text-xs text-destructive pl-1">
                            <div className="w-1 h-1 rounded-full bg-destructive mt-1.5 shrink-0" />
                            <span>{highlightText(err, diagnosisSearch)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(diagnosisFilter === 'all' || diagnosisFilter === 'warnings') && hasFilteredWarnings && (
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-[10px] uppercase tracking-widest bg-amber-50 p-2 rounded-t-lg border-b border-amber-200/50">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Sugestões de Melhoria
                </div>
                <div className="space-y-5 px-1">
                  {STEPS.map((s, idx) => {
                    const stepIssues = validationByStep[idx];
                    const filteredWarnings = stepIssues.warnings.filter(warn =>
                      warn.toLowerCase().includes(diagnosisSearch.toLowerCase())
                    );
                    if (filteredWarnings.length === 0) return null;
                    return (
                      <div key={`warn-group-${idx}`} className="space-y-2">
                        <div className="flex items-center gap-2 border-b border-dashed pb-1">
                          <Badge variant="outline" className="h-5 text-[10px] px-1.5">{s.label}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => onStepClick(idx)} className="ml-auto text-[10px] h-5">Corrigir</Button>
                        </div>
                        {filteredWarnings.map((warn, i) => (
                          <div key={`warn-${idx}-${i}`} className="flex gap-2 text-xs text-amber-700 pl-1">
                            <div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                            <span>{highlightText(warn, diagnosisSearch)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {nothingFoundInView && (
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
