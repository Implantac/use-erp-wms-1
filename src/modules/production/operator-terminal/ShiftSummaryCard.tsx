import { Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';

type Props = {
  activities: number;
};

export function ShiftSummaryCard({ activities }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" /> Resumo do Turno
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Atividades concluídas hoje pelo nome informado: {activities}. Totais, qualidade e produtividade não mensurados: OPs podem ter unidades distintas, o operador não é autenticado e pausas não têm duração confiável.</p>
      </CardContent>
    </Card>
  );
}
