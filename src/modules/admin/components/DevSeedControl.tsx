import { Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';

export function DevSeedControl() {
  return (
    <Card className="border-warning/20 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Dados de teste</CardTitle>
        <CardDescription>O navegador não executa scripts locais de seed.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        O comando de seed deve ser executado manualmente por um operador autorizado em ambiente de testes.
        Nenhum dado é criado por esta tela. Nunca use dados de demonstração em bases de clientes.
      </CardContent>
    </Card>
  );
}
