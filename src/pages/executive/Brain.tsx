import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Bot, Database, History, AlertTriangle, Sparkles } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import {
  useBrainDecisions, useApproveDecision, useBrainMemories, useBrainRuns,
  useRunBrain, useBrainChat,
} from '@/hooks/ai/useAIBrain';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BrainHero } from './brain/BrainHero';
import { BrainChat } from './brain/BrainChat';
import { BrainDecisions } from './brain/BrainDecisions';
import { BrainMemory } from './brain/BrainMemory';
import { BrainHistory } from './brain/BrainHistory';

export default function BrainPage() {
  const { data: pending = [] } = useBrainDecisions('pending');
  const { data: allDecisions = [] } = useBrainDecisions();
  const { data: memories = [] } = useBrainMemories();
  const { data: runs = [] } = useBrainRuns();
  const runBrain = useRunBrain();
  const approve = useApproveDecision();
  const { messages, loading, send, clear } = useBrainChat();

  const [input, setInput] = useState('');
  const [memorySearch, setMemorySearch] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const memorySearchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  // QA-UX: Ctrl+K no Brain deve focar a busca de memória, como a interface
  // indica. A CommandPalette é dona do atalho em capture phase e delega por
  // evento cancelável; listeners locais de keydown nunca eram alcançados.
  useEffect(() => {
    const onCtrlK = (e: Event) => {
      e.preventDefault();
      setActiveTab('memory');
      requestAnimationFrame(() => memorySearchRef.current?.focus());
    };
    window.addEventListener('app:ctrlk', onCtrlK);
    return () => window.removeEventListener('app:ctrlk', onCtrlK);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typingInField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.key === '/' && !typingInField && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActiveTab('chat');
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && messages.length > 0) {
        e.preventDefault();
        clear();
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const tabs = ['chat', 'decisions', 'memory', 'history'];
        setActiveTab(tabs[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [messages.length, clear]);

  const lastRun = runs[0];
  const veredicto = lastRun?.structured?.veredicto as string | undefined;
  const autoExec = allDecisions.filter((d) => d.status === 'auto_executed').length;
  const critical = allDecisions.filter((d) => d.impact_level === 'critical' && d.status === 'pending').length;

  const filteredMemories = useMemo(() => {
    if (!memorySearch.trim()) return memories;
    const q = memorySearch.toLowerCase();
    return memories.filter((m) => {
      const v = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
      return m.key.toLowerCase().includes(q) || v.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
    });
  }, [memories, memorySearch]);

  const handleSend = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || loading) return;
    setInput('');
    send(t);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <PageContainer>
      <a
        href="#brain-composer"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Pular para o campo de mensagem
      </a>

      <BrainHero
        lastRun={lastRun}
        pendingCount={pending.length}
        criticalCount={critical}
        autoExec={autoExec}
        memoriesCount={memories.length}
        onAnalyze={() => runBrain.mutate('analyze')}
        onAutopilot={() => runBrain.mutate('autopilot')}
        runPending={runBrain.isPending}
      />

      {veredicto && (
        <Card className="border-l-4 border-l-primary bg-card/60 backdrop-blur">
          <CardContent className="p-4 flex gap-3">
            <div className="shrink-0 h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Veredicto do Cérebro</p>
              <p className="text-sm leading-relaxed">{veredicto}</p>
              {lastRun && (
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(lastRun.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })} · {lastRun.decisions_count} decisões geradas
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 p-1" aria-label="Seções do Cérebro Nativo">
          <TabsTrigger value="chat" className="gap-1.5" aria-keyshortcuts="Alt+1">
            <Bot className="h-4 w-4" aria-hidden="true" /> Chat
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-1.5" aria-keyshortcuts="Alt+2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Decisões
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]" aria-label={`${pending.length} pendentes`}>
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5" aria-keyshortcuts="Alt+3">
            <Database className="h-4 w-4" aria-hidden="true" /> Memória
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5" aria-keyshortcuts="Alt+4">
            <History className="h-4 w-4" aria-hidden="true" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <BrainChat
            messages={messages}
            loading={loading}
            input={input}
            setInput={setInput}
            onSend={handleSend}
            onClear={clear}
            textareaRef={textareaRef}
          />
        </TabsContent>

        <TabsContent value="decisions">
          <BrainDecisions
            decisions={allDecisions}
            onApprove={(id, appr) => approve.mutate({ id, approve: appr })}
            approvePending={approve.isPending}
            onAnalyze={() => runBrain.mutate('analyze')}
          />
        </TabsContent>

        <TabsContent value="memory">
          <BrainMemory
            memories={memories}
            filteredMemories={filteredMemories}
            memorySearch={memorySearch}
            setMemorySearch={setMemorySearch}
            memorySearchRef={memorySearchRef}
          />
        </TabsContent>

        <TabsContent value="history">
          <BrainHistory runs={runs} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
