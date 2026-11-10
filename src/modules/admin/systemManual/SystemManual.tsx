import { useMemo, useState, useEffect, useRef } from 'react';
import { Search, GraduationCap, Sparkles, AlertCircle, FileText, CheckCircle2, ShieldCheck } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { MANUAL_MODULES, MANUAL_CATEGORIES, DIFFICULTY_STYLE } from './content';
import { useManualProgress } from './useManualProgress';
import manualIcon from './assets/manual-icon.png';
import { ProgressCard } from './home/ProgressCard';
import { RoadmapCard } from './home/RoadmapCard';
import { LearningPathsCard } from './home/LearningPathsCard';
import { ModulesGrid } from './home/ModulesGrid';
import { QuickStartCard } from './home/QuickStartCard';
import { GlossaryCard } from './home/GlossaryCard';
import { FAQCard } from './home/FAQCard';
import { CertificateCard } from './home/CertificateCard';

export default function SystemManual() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const { isDone, count, reset } = useManualProgress();

  useEffect(() => {
    // QA-UX: o Ctrl+K pertence à CommandPalette (capture phase + stopPropagation).
    // Antes este listener nunca disparava e o placeholder "(Ctrl+K)" era uma
    // promessa quebrada. Reivindicamos o evento cancelável que a paleta dispara.
    const handleCtrlK = (e: Event) => {
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('app:ctrlk', handleCtrlK);
    return () => window.removeEventListener('app:ctrlk', handleCtrlK);
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return MANUAL_MODULES.filter((m) => {
      if (cat !== 'all' && m.category !== cat) return false;
      if (!t) return true;
      return (
        m.title.toLowerCase().includes(t) ||
        m.short.toLowerCase().includes(t) ||
        m.category.toLowerCase().includes(t)
      );
    });
  }, [q, cat]);

  const total = MANUAL_MODULES.length;
  const categories = Object.keys(MANUAL_CATEGORIES) as (keyof typeof MANUAL_CATEGORIES)[];

  return (
    <PageContainer>
      <PageHeader
        title="Manual do Sistema & Central de Treinamento"
        description="Treinamento completo para implantação e uso diário. Aprenda a operar fluxos ponta a ponta (O2C, P2P) com o padrão Enterprise."
        icon={GraduationCap}
      />

      <div className="grid gap-6 mb-8 lg:grid-cols-3">
        <Card className="border-l-4 border-l-red-500 bg-red-500/5 hover:bg-red-500/10 transition-colors cursor-pointer group" onClick={() => setCat('all')}>
          <CardHeader className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-red-600">Foco do Mês: Processos</h3>
            </div>
            <CardDescription className="text-xs font-medium text-foreground">
              Estamos fechando os fluxos <strong>ponta a ponta</strong>. Comece pelo Order-to-Cash (O2C).
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-primary bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group">
          <CardHeader className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-primary">Status da Governança</h3>
            </div>
            <CardDescription className="text-xs font-medium text-foreground">
              Fase 3 Concluída: <strong>Ledger Logístico Imutável</strong> ativo e auditando movimentações.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-green-500 bg-green-500/5 hover:bg-green-500/10 transition-colors cursor-pointer group">
          <CardHeader className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-green-600">Acuracidade Sourcing</h3>
              <Badge variant="outline" className="ml-auto text-[10px] bg-green-500/10">99.2%</Badge>
            </div>
            <CardDescription className="text-xs font-medium text-foreground">
              IA de Sourcing operando com precisão máxima em 25 filiais ativas.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="mb-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 overflow-hidden">
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-center">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Um manual pensado para quem nunca usou um ERP
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Cada módulo tem uma aba <strong>👋 Para leigos</strong> com linguagem simples, uma analogia do dia a dia,
              os primeiros passos em português claro e um mini-dicionário. Se você é novo por aqui, comece pelos módulos
              marcados como <Badge variant="outline" className={DIFFICULTY_STYLE.Iniciante}>Iniciante</Badge>.
            </CardDescription>
          </CardHeader>
          <div className="pr-6 pb-6 md:pb-0 md:pr-8 hidden md:block">
            <img
              src={manualIcon}
              alt="Manual do sistema — livro aberto com lâmpada"
              width={140}
              height={140}
              loading="lazy"
              className="drop-shadow-xl"
            />
          </div>
        </div>
      </Card>

      <ProgressCard count={count} total={total} onReset={reset} />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Buscar módulo, categoria ou palavra-chave... (Ctrl+K)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={cat === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setCat('all')}>
            Todos ({MANUAL_MODULES.length})
          </Button>
          {categories.map((c) => {
            const n = MANUAL_MODULES.filter((m) => m.category === c).length;
            return (
              <Button key={c} variant={cat === c ? 'default' : 'outline'} size="sm" onClick={() => setCat(c)}>
                {c} ({n})
              </Button>
            );
          })}
        </div>
      </div>

      <RoadmapCard />
      <LearningPathsCard isDone={isDone} />

      <ModulesGrid modules={filtered} isDone={isDone} query={q} />

      <QuickStartCard />
      <GlossaryCard />
      <FAQCard />

      {count === total && total > 0 && <CertificateCard total={total} />}
    </PageContainer>
  );
}
