import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/ui/base/card';

/** BI does not have the machine-time and loss-series inputs to calculate global OEE. */
export function OEETab() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <h3 className="text-lg font-semibold">OEE global não apurado</h3>
        <p className="text-sm text-muted-foreground">Tempo estimado/real das OPs e quantidade planejada/produzida não medem disponibilidade, velocidade ideal e perdas de qualidade por máquina na mesma janela. Não é possível calcular OEE nem classificar desempenho a partir deles.</p>
        <p className="text-sm text-muted-foreground">Consulte os <Link to="/production/oee" className="underline">registros OEE por empresa</Link>; sua origem e calibração ainda exigem auditoria. Eles não compõem automaticamente um índice global.</p>
      </CardContent>
    </Card>
  );
}
