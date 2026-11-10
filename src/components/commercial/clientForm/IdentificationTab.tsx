import { Loader2, Search, Building2, User, CheckCircle2, AlertTriangle } from 'lucide-react';
import { TabsContent } from '@/ui/base/tabs';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Badge } from '@/ui/base/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { maskCNPJ, maskCPF, maskPhone } from '@/lib/maskUtils';
import { cn } from '@/lib/utils';
import type { ClientForm, Update } from './formState';

interface Props {
  formData: ClientForm;
  update: Update;
  errors: Record<string, string>;
  setPersonType: (pt: 'PF' | 'PJ') => void;
  handleCnpjLookup: () => void;
  cnpjLoading: boolean;
  duplicate: { id: string; name: string; code: string } | null;
}

export function IdentificationTab({ formData, update, errors, setPersonType, handleCnpjLookup, cnpjLoading, duplicate }: Props) {
  return (
    <TabsContent value="identification" className="mt-0 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {(['PJ', 'PF'] as const).map((pt) => {
          const active = formData.person_type === pt;
          const Icon = pt === 'PJ' ? Building2 : User;
          return (
            <button
              key={pt}
              type="button"
              onClick={() => setPersonType(pt)}
              className={cn(
                'flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-all',
                active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              )}
            >
              <Icon className={cn('h-6 w-6', active ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <p className="font-semibold text-sm">{pt === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                <p className="text-xs text-muted-foreground">{pt === 'PJ' ? 'CNPJ · Razão Social · IE' : 'CPF · RG · Data de Nascimento'}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <Label>{formData.person_type === 'PJ' ? 'CNPJ' : 'CPF'} *</Label>
        <div className="flex gap-2">
          <Input
            value={formData.document}
            onChange={(e) => update({ document: formData.person_type === 'PJ' ? maskCNPJ(e.target.value) : maskCPF(e.target.value) })}
            placeholder={formData.person_type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
            data-field="document"
            aria-invalid={Boolean(errors.document || duplicate) || undefined}
            className={errors.document ? 'border-destructive' : ''}
          />
          {formData.person_type === 'PJ' && (
            <Button type="button" variant="outline" size="icon" onClick={handleCnpjLookup} disabled={cnpjLoading} title="Buscar dados na Receita Federal">
              {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          )}
        </div>
        {errors.document && <p className="text-xs text-destructive">{errors.document}</p>}
        {duplicate && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Já existe: <span className="font-medium">{duplicate.name}</span> ({duplicate.code})
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{formData.person_type === 'PJ' ? 'Razão Social' : 'Nome Completo'} *</Label>
        <Input value={formData.name} onChange={(e) => update({ name: e.target.value })} aria-invalid={!!errors.name || undefined} className={errors.name ? 'border-destructive' : ''} />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {formData.person_type === 'PJ' && (
        <>
          <div className="space-y-2">
            <Label>Nome Fantasia</Label>
            <Input value={formData.trade_name} onChange={(e) => update({ trade_name: e.target.value })} />
          </div>
          {(formData.cnae_primary || formData.receita_status) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs">
              {formData.receita_status && (
                <Badge variant={/ATIVA/i.test(formData.receita_status) ? 'default' : 'destructive'} className="gap-1">
                  {/ATIVA/i.test(formData.receita_status) ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {formData.receita_status}
                </Badge>
              )}
              {formData.cnae_primary && (
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">CNAE {formData.cnae_primary}</span>
                  {formData.cnae_description ? ` · ${formData.cnae_description}` : ''}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {formData.person_type === 'PF' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>RG</Label>
            <Input value={formData.rg} onChange={(e) => update({ rg: e.target.value })} placeholder="00.000.000-0" />
          </div>
          <div className="space-y-2">
            <Label>Data de Nascimento</Label>
            <Input type="date" value={formData.birth_date} onChange={(e) => update({ birth_date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Gênero</Label>
            <Select value={formData.gender || '_none'} onValueChange={(v) => update({ gender: v === '_none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Não informar</SelectItem>
                <SelectItem value="F">Feminino</SelectItem>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="O">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>E-mail *</Label>
          <Input type="email" value={formData.email} onChange={(e) => update({ email: e.target.value })} aria-invalid={!!errors.email || undefined} className={errors.email ? 'border-destructive' : ''} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label>Telefone *</Label>
          <Input value={formData.phone} onChange={(e) => update({ phone: maskPhone(e.target.value) })} placeholder="(00) 0000-0000" aria-invalid={!!errors.phone || undefined} className={errors.phone ? 'border-destructive' : ''} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Celular / WhatsApp</Label>
          <Input value={formData.cellphone} onChange={(e) => update({ cellphone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => update({ status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </TabsContent>
  );
}
