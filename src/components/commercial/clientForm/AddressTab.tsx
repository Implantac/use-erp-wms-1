import { Loader2, MapPin } from 'lucide-react';
import { TabsContent } from '@/ui/base/tabs';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { maskCEP } from '@/lib/maskUtils';
import { brazilianStates } from '@/config/commercial';
import type { ClientForm, Update } from './formState';

interface Props {
  formData: ClientForm;
  update: Update;
  errors: Record<string, string>;
  handleCepLookup: () => void;
  cepLoading: boolean;
}

export function AddressTab({ formData, update, errors, handleCepLookup, cepLoading }: Props) {
  return (
    <TabsContent value="address" className="mt-0 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>CEP *</Label>
          <div className="flex gap-2">
            <Input
              value={formData.address_zip_code}
              onChange={(e) => update({ address_zip_code: maskCEP(e.target.value) })}
              placeholder="00000-000"
              aria-invalid={!!errors.address_zip_code || undefined}
              className={errors.address_zip_code ? 'border-destructive' : ''}
            />
            <Button type="button" variant="outline" size="icon" onClick={handleCepLookup} disabled={cepLoading} title="Buscar endereço pelo CEP">
              {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            </Button>
          </div>
          {errors.address_zip_code && <p className="text-xs text-destructive">{errors.address_zip_code}</p>}
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Logradouro</Label>
          <Input value={formData.address_street} onChange={(e) => update({ address_street: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Número</Label>
          <Input value={formData.address_number} onChange={(e) => update({ address_number: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Complemento</Label>
          <Input value={formData.address_complement} onChange={(e) => update({ address_complement: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Bairro</Label>
          <Input value={formData.address_neighborhood} onChange={(e) => update({ address_neighborhood: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-2">
          <Label>Cidade *</Label>
          <Input value={formData.address_city} onChange={(e) => update({ address_city: e.target.value })} aria-invalid={!!errors.address_city || undefined} className={errors.address_city ? 'border-destructive' : ''} />
        </div>
        <div className="space-y-2">
          <Label>UF *</Label>
          <Select value={formData.address_state} onValueChange={(v) => update({ address_state: v })}>
            <SelectTrigger aria-invalid={!!errors.address_state || undefined} className={errors.address_state ? 'border-destructive' : ''}><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>
              {brazilianStates.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Região</Label>
          <Input value={formData.region} onChange={(e) => update({ region: e.target.value })} placeholder="Ex: Sul, Sudeste..." />
        </div>
        <div className="space-y-2">
          <Label>Micro-Região</Label>
          <Input value={formData.micro_region} onChange={(e) => update({ micro_region: e.target.value })} placeholder="Ex: Grande SP..." />
        </div>
      </div>
    </TabsContent>
  );
}
