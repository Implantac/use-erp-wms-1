import { Package, Trash2 } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { formatBRL } from '@/lib/formatters';
import { toSafeNumber } from '@/lib/numericValidation';
import { SmartSelect, SmartSelectOption } from '../SmartSelect';
import type { NFeItemForm } from './types';

interface Props {
  items: NFeItemForm[];
  productOptions: SmartSelectOption[];
  onAddProduct: (productId: string) => void;
  onUpdateItem: (idx: number, field: keyof NFeItemForm, value: string | number) => void;
  onRemoveItem: (idx: number) => void;
}

export function StepProducts({ items, productOptions, onAddProduct, onUpdateItem, onRemoveItem }: Props) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Listagem de Itens</h3>
          <p className="text-sm text-muted-foreground">Adicione os produtos ou serviços que compõem esta nota</p>
        </div>
        <div className="w-96">
          <SmartSelect
            options={productOptions}
            value=""
            onChange={onAddProduct}
            placeholder="Adicionar produto..."
          />
        </div>
      </div>

      {items.length > 0 ? (
        <div className="rounded-2xl border shadow-xl overflow-hidden bg-background">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[350px]">Produto</TableHead>
                <TableHead className="w-[120px]">CFOP</TableHead>
                <TableHead className="w-[100px]">Qtd</TableHead>
                <TableHead className="w-[150px]">Preço Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx} className="hover:bg-muted/30 group">
                  <TableCell className="py-4">
                    <div className="font-bold">{item.productName}</div>
                    <div className="text-[10px] text-muted-foreground flex gap-2 mt-1">
                      <span>CÓD: {item.productCode}</span>
                      <span>•</span>
                      <span>UN: {item.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input value={item.cfop} maxLength={4} inputMode="numeric" pattern="[1-7][0-9]{3}" placeholder="CFOP" aria-label={`CFOP do item ${idx + 1}`} onChange={(e) => onUpdateItem(idx, 'cfop', e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-9 font-mono text-xs" />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => onUpdateItem(idx, 'quantity', toSafeNumber(e.target.value, 0, { maxDecimals: 3, min: 0 }))}
                      className="h-9 font-bold text-center"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => onUpdateItem(idx, 'unitPrice', toSafeNumber(e.target.value, 0, { maxDecimals: 2, min: 0 }))}
                        className="h-9 pl-6 font-bold"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">
                    {formatBRL(item.quantity * item.unitPrice)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => onRemoveItem(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="py-20 text-center border-2 border-dashed rounded-2xl bg-muted/20">
          <Package className="h-16 w-16 mx-auto opacity-10 mb-4" />
          <p className="text-muted-foreground">Nenhum item adicionado ainda.</p>
        </div>
      )}
    </div>
  );
}
