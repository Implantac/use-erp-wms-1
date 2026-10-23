import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Textarea } from '@/ui/base/textarea';
import { Progress } from '@/ui/base/progress';
import { Loader2, XCircle, ShieldCheck } from 'lucide-react';
import type { AnswerMap, PublicSurvey, Question } from '@/modules/nps/public/types';
import { errorMessage } from '@/lib/errors';
import { getSupabaseUrl, getSupabasePublishableKey } from '@/integrations/supabase/config';
import { QuestionRenderer } from '@/modules/nps/public/QuestionRenderer';
import { DoneView } from '@/modules/nps/public/DoneView';
import { ScoreSelector } from '@/modules/nps/public/ScoreSelector';

/**
 * Rota pública /nps/:token — sem autenticação.
 * Envia respostas via edge function nps-public-submit.
 */
export default function PublicNPS() {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'submitting' | 'done' | 'error'>('loading');
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [error, setError] = useState<string>('');
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [touched, setTouched] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const projectUrl = getSupabaseUrl();
  const anon = getSupabasePublishableKey();

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${projectUrl}/functions/v1/nps-public-get?token=${encodeURIComponent(token)}`, {
          headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error ?? 'Pesquisa indisponível');
        setSurvey(json);
        setState('ready');
      } catch (e) {
        setError(errorMessage(e, 'Erro'));
        setState('error');
      }
    })();
  }, [token, projectUrl, anon]);

  const questions: Question[] = useMemo(() => (survey?.questions ?? []) as Question[], [survey]);
  const requiredMissing = useMemo(() => {
    if (score === null) return true;
    return questions.some((q) => {
      if (!q.required) return false;
      const v = answers[q.id];
      if (Array.isArray(v)) return v.length === 0;
      return v === undefined || v === null || v === '';
    });
  }, [questions, answers, score]);

  const totalSteps = 1 + questions.length;
  const doneSteps = (score !== null ? 1 : 0) + questions.filter((q) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '' && v !== null;
  }).length;
  const progress = Math.round((doneSteps / totalSteps) * 100);

  const submit = async () => {
    setTouched(true);
    if (score === null || requiredMissing) return;
    setState('submitting');
    try {
      const payloadAnswers: Array<{ question_id: string; value_text?: string; value_number?: number; value_json?: unknown }> = [];
      Object.entries(answers).forEach(([question_id, value]) => {
        if (question_id.endsWith('__other')) return;
        if (value === undefined || value === null || value === '') return;
        const otherText = (answers[`${question_id}__other`] as string | undefined)?.trim();
        if (otherText) {
          payloadAnswers.push({ question_id, value_json: { value, other: otherText } });
        } else if (typeof value === 'number') payloadAnswers.push({ question_id, value_number: value });
        else if (Array.isArray(value) || typeof value === 'object') payloadAnswers.push({ question_id, value_json: value });
        else payloadAnswers.push({ question_id, value_text: String(value) });
      });
      const resp = await fetch(`${projectUrl}/functions/v1/nps-public-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${anon}` },
        body: JSON.stringify({
          token,
          score,
          comment,
          answers: payloadAnswers,
          response_time_seconds: Math.round((Date.now() - startedAt) / 1000),
          ua: navigator.userAgent,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error ?? 'Erro ao enviar');
      setState('done');
    } catch (e) {
      setError(errorMessage(e, 'Erro ao enviar'));
      setState('error');
    }
  };

  if (state === 'loading')
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );

  if (state === 'error')
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100 p-4">
        <Card className="max-w-md w-full bg-slate-900 border-slate-800">
          <CardContent className="pt-6 text-center space-y-3">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <p className="text-lg">{error}</p>
            <p className="text-xs text-slate-400">Se você acredita que é um engano, entre em contato com o remetente.</p>
          </CardContent>
        </Card>
      </div>
    );

  if (state === 'done')
    return <DoneView survey={survey} hasComment={comment.trim().length > 5} token={token} projectUrl={projectUrl} anon={anon} />;

  const c = survey!.campaign;
  const primary = c.primary_color ?? '#FF9800';
  const followUp =
    score !== null && score >= 9
      ? 'O que você mais gostou? (opcional)'
      : score !== null && score <= 6
      ? 'O que podemos melhorar? (opcional)'
      : 'Deixe um comentário (opcional)';

  return (
    <div className="min-h-screen px-3 py-5 sm:p-6 md:p-8" style={{ background: '#0f172a', color: '#f1f5f9' }}>
      <div className="w-full max-w-[640px] mx-auto space-y-4 sm:space-y-5">
        <div className="text-center space-y-2 sm:space-y-3 px-1">
          {(c.logo_url ?? survey!.company?.logo_url) && (
            <img src={c.logo_url ?? survey!.company?.logo_url} alt={survey!.company?.name ?? 'Logo'} className="h-10 sm:h-12 mx-auto" />
          )}
          <h1 className="text-xl sm:text-2xl font-bold leading-snug text-white">{c.title ?? 'Como avalia sua experiência?'}</h1>
          {c.subtitle && <p className="text-sm sm:text-base text-slate-200 leading-relaxed">{c.subtitle}</p>}
          {c.message && <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{c.message}</p>}
        </div>

        <Progress value={progress} className="h-1 bg-slate-800" />

        <Card className="bg-slate-900 border-slate-800 rounded-xl">
          <CardContent className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            <ScoreSelector
              score={score}
              setScore={setScore}
              primary={primary}
              companyName={survey!.company?.name ?? 'nossa empresa'}
              touched={touched}
            />

            {score !== null && (
              <div className="space-y-2 pt-3 sm:pt-2 border-t border-slate-800">
                <label className="block text-[15px] sm:text-base font-semibold text-white leading-snug">{followUp}</label>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 text-sm" maxLength={2000} />
                <p className="text-xs text-slate-400 text-right">{comment.length}/2000</p>
              </div>
            )}

            {questions.map((q, i) => (
              <div key={q.id} className="space-y-2.5 pt-3 sm:pt-2 border-t border-slate-800">
                <label className="block text-[15px] sm:text-base font-semibold text-white leading-snug">
                  {i + 1}. {q.question_text}
                  {q.required && <span className="text-red-400"> *</span>}
                </label>
                <QuestionRenderer q={q} answers={answers} setAnswers={setAnswers} touched={touched} primary={primary} />
              </div>
            ))}

            <Button
              onClick={submit}
              disabled={state === 'submitting'}
              className="w-full h-12 text-base font-semibold"
              style={{ background: primary, color: '#0f172a' }}
            >
              {state === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar avaliação'}
            </Button>
            {touched && requiredMissing && score !== null && (
              <p className="text-xs text-red-400 text-center">Responda as perguntas obrigatórias antes de enviar.</p>
            )}
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Suas respostas são confidenciais e utilizadas somente para melhorar sua experiência.
        </p>
      </div>
    </div>
  );
}
