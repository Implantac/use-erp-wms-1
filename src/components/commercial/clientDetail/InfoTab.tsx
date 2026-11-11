import { TabsContent } from '@/ui/base/tabs';
import { type DbClient } from '@/hooks/commercial/useClients';

export function InfoTab({ client }: { client: DbClient }) {
  return (
    <TabsContent value="info" className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-muted-foreground block text-xs">Código</span><p className="font-mono">{client.code}</p></div>
        <div><span className="text-muted-foreground block text-xs">{String(client.document_type || '').toUpperCase() === 'CNPJ' ? 'CNPJ' : 'CPF'}</span><p>{client.document}</p></div>
        <div><span className="text-muted-foreground block text-xs">E-mail</span><p>{client.email}</p></div>
        <div><span className="text-muted-foreground block text-xs">Telefone</span><p>{client.phone}{client.cellphone ? ` / ${client.cellphone}` : ''}</p></div>
        {client.state_registration && <div><span className="text-muted-foreground block text-xs">IE</span><p>{client.state_registration}</p></div>}
        {client.municipal_registration && <div><span className="text-muted-foreground block text-xs">IM</span><p>{client.municipal_registration}</p></div>}
      </div>
      <div className="border-t pt-3 text-sm">
        <span className="text-muted-foreground block text-xs mb-1">Endereço</span>
        <p>{client.address_street}, {client.address_number}{client.address_complement ? ` - ${client.address_complement}` : ''}</p>
        <p>{client.address_neighborhood} - {client.address_city}/{client.address_state} - CEP: {client.address_zip_code}</p>
      </div>
      {client.segment && (
        <div className="text-sm"><span className="text-muted-foreground block text-xs">Segmento</span><p>{client.segment}</p></div>
      )}
    </TabsContent>
  );
}
