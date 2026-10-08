import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';

const controls = [
  { title: 'Isolamento entre empresas (RLS)', description: 'Requer teste contra o banco implantado, com duas contas de empresas distintas e validação de leitura e escrita.' },
  { title: 'Certificados digitais e armazenamento de chaves', description: 'Requer verificação da configuração real, permissões de acesso, validade e política de rotação. Não há HSM comprovado nesta tela.' },
  { title: 'Integridade da trilha de auditoria', description: 'Requer testes de alteração, exclusão, permissões e retenção no banco implantado.' },
  { title: 'Acesso a recursos por identificador (IDOR)', description: 'Requer testes de autorização em rotas, serviços e Edge Functions com identidades de empresas diferentes.' },
  { title: 'Privacidade e retenção de dados', description: 'Requer auditoria documentada de consentimento, exclusão, backups e prazos reais de retenção.' },
];

export default function SecurityAudit() {
  return (
    <PageContainer>
      <PageHeader
        title="Auditoria de Segurança & Infraestrutura"
        description="Controles pendentes de verificação no ambiente implantado. Esta tela não executa uma auditoria automática."
        icon={ShieldAlert}
      />
      <div role="status" className="mb-6 rounded-md border border-warning p-4 text-sm flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p><strong>Conformidade não verificada.</strong> Sem evidências atuais do banco e da infraestrutura, não há score, certificação ou data de próxima auditoria a apresentar. Nenhum controle abaixo deve ser interpretado como aprovado.</p>
      </div>
      <div className="grid gap-4">
        {controls.map((control) => (
          <Card key={control.title}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">{control.title}</CardTitle>
                <Badge variant="secondary">NÃO VERIFICADO</Badge>
              </div>
            </CardHeader>
            <CardContent><CardDescription>{control.description}</CardDescription></CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
