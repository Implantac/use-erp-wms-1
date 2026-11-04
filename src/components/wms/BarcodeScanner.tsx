import { useEffect, useRef, useState } from 'react';
import { Input } from '@/ui/base/input';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent } from '@/ui/base/card';
import { ScanBarcode, Zap, CheckCircle2, XCircle, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ScanFeedback {
  type: 'success' | 'error' | 'info';
  message: string;
  code?: string;
}

interface BarcodeScannerProps {
  onScan: (code: string) => Promise<ScanFeedback> | ScanFeedback;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Barcode Scanner Component
 * - Compatible with USB barcode readers (HID keyboard mode emit keys + Enter)
 * - Manual typing fallback
 * - Audible + visual feedback (success/error)
 * - Tracks last 5 scans
 */
export function BarcodeScanner({ onScan, placeholder = 'Escaneie ou digite o código de barras...', autoFocus = true, disabled }: BarcodeScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [history, setHistory] = useState<ScanFeedback[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Auto-focus to keep scanner ready
  useEffect(() => {
    if (autoFocus && !disabled) {
      const i = setInterval(() => {
        // Only autofocus if the tab is visible and focus isn't in another input
        if (document.visibilityState === 'visible' && 
            document.activeElement?.tagName !== 'INPUT' && 
            document.activeElement?.tagName !== 'TEXTAREA') {
          inputRef.current?.focus();
        }
      }, 1000); // Relaxed to 1000ms
      return () => clearInterval(i);
    }
  }, [autoFocus, disabled]);

  const beep = (success: boolean) => {
    if (!soundOn) return;
    try {
      const AudioCtor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 880 : 220;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio feedback opcional — ignora falha (sem suporte AudioContext)
    }
  };

  const submit = async (code: string) => {
    if (!code.trim() || scanning) return;
    setScanning(true);
    try {
      const result = await onScan(code.trim());
      setFeedback(result);
      setHistory(prev => [{ ...result, code }, ...prev].slice(0, 5));
      beep(result.type === 'success');
      setValue('');
      // Auto-clear feedback
      setTimeout(() => setFeedback(null), 2500);
    } finally {
      setScanning(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(value);
    }
  };

  const feedbackColor = feedback?.type === 'success'
    ? 'border-primary bg-primary/10'
    : feedback?.type === 'error'
      ? 'border-destructive bg-destructive/10'
      : 'border-primary bg-primary/10';

  return (
    <Card className={cn('transition-all', feedback && feedbackColor)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              'p-2 rounded-md transition-colors',
              scanning ? 'bg-primary text-primary-foreground animate-pulse' : 'bg-muted'
            )}>
              <ScanBarcode className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium leading-tight">Leitor de Código de Barras</p>
              <p className="text-xs text-muted-foreground">Aponte o leitor ou digite manualmente</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSoundOn(s => !s)} title={soundOn ? 'Desativar som' : 'Ativar som'}>
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || scanning}
            className="font-mono"
            autoFocus={autoFocus}
          />
          <Button onClick={() => submit(value)} disabled={!value.trim() || disabled || scanning} className="gap-2">
            <Zap className="h-4 w-4" /> Ler
          </Button>
        </div>

        {feedback && (
          <div className={cn(
            'flex items-center gap-2 p-2 rounded-md text-sm font-medium',
            feedback.type === 'success' && 'text-primary',
            feedback.type === 'error' && 'text-destructive',
            feedback.type === 'info' && 'text-primary'
          )}>
            {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : feedback.type === 'error' ? <XCircle className="h-4 w-4" /> : <ScanBarcode className="h-4 w-4" />}
            <span>{feedback.message}</span>
            {feedback.code && <Badge variant="outline" className="font-mono ml-auto">{feedback.code}</Badge>}
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Últimas leituras</p>
            <div className="flex flex-wrap gap-1.5">
              {history.map((h, i) => (
                <Badge key={i} variant={h.type === 'success' ? 'outline' : h.type === 'error' ? 'destructive' : 'secondary'} className="font-mono text-xs">
                  {h.type === 'success' ? '✓' : '✗'} {h.code}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
