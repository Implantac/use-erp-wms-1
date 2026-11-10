import { useConfirm } from '@/shared/components/confirmContext';
import { useState } from 'react';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/ui/base/table';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Edit2, RefreshCw, Eye, EyeOff, Settings2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parameterCategoryConfig } from '@/config/administration';
import { ParameterCategory } from '@/types/administration';
import { useSystemParameters } from '@/hooks/system/useSystemParameters';
import type { Tables } from '@/integrations/supabase/types';

type ParameterRow = Tables<'system_parameters'>;

interface ParametersTableProps {
  parameters: ParameterRow[];
  onEdit: (param: ParameterRow) => void;
}

export const ParametersTable = ({ parameters, onEdit }: ParametersTableProps) => {
  const confirm = useConfirm();
  const { updateParameter } = useSystemParameters();
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});

  const handleReset = async (param: ParameterRow) => {
    if (await confirm({ title: 'Restaurar parâmetro?', description: `Deseja restaurar o parâmetro ${param.name} para o valor padrão?`, confirmLabel: 'Restaurar' })) {
      await updateParameter({ code: param.code, value: param.default_value });
    }
  };

  const renderValue = (param: ParameterRow) => {
    if (param.sensitive && !showSensitive[param.id]) {
      return '********';
    }
    if (param.type === 'boolean') {
      return param.value === 'true' ? 'Sim' : 'Não';
    }
    return param.value;
  };

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parâmetro</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parameters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-4">
                  <EmptyState
                    compact
                    icon={Settings2}
                    title="Nenhum parâmetro encontrado"
                    description="Ajuste os filtros ou cadastre parâmetros para configurar o comportamento do sistema."
                  />
                </TableCell>
              </TableRow>
            ) : parameters.map((param) => (
              <TableRow key={param.id}>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{param.name}</p>
                      {param.required && <Badge variant="outline" className="text-xs">Obrigatório</Badge>}
                      {param.sensitive && <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">Sensível</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{param.description}</p>
                    <p className="text-xs font-mono text-muted-foreground">{param.code}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${parameterCategoryConfig[param.category as ParameterCategory]?.bgColor || 'bg-gray-100'} ${parameterCategoryConfig[param.category as ParameterCategory]?.color || 'text-gray-700'} border-0`}>
                    {parameterCategoryConfig[param.category as ParameterCategory]?.label || param.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{renderValue(param)}</span>
                    {param.sensitive && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSensitive(prev => ({ ...prev, [param.id]: !prev[param.id] }))}>
                        {showSensitive[param.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    <p>{param.updated_at ? format(new Date(param.updated_at), "dd/MM/yyyy", { locale: ptBR }) : '—'}</p>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(param)}><Edit2 className="h-4 w-4" /></Button>
                    {param.value !== param.default_value && (
                      <Button variant="ghost" size="icon" onClick={() => handleReset(param)}><RefreshCw className="h-4 w-4" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
