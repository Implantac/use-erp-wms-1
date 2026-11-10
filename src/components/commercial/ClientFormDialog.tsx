import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Button } from '@/ui/base/button';
import { scheduleFocusInvalid } from '@/ui/base/focusInvalid';
import { useCnpjLookup } from '@/hooks/system/useCnpjLookup';
import { useClientDuplicateCheck } from '@/hooks/commercial/useClientDuplicateCheck';
import { useSalesReps } from '@/hooks/commercial/useSalesReps';
import { maskCEP, maskPhone, lookupCEP } from '@/lib/maskUtils';
import { useCreateClient, useUpdateClient, type DbClient } from '@/hooks/commercial/useClients';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import {
  defaultForm,
  clientToForm,
  validateClientForm,
  buildClientPayload,
  type ClientForm,
} from './clientForm/formState';
import { IdentificationTab } from './clientForm/IdentificationTab';
import { AddressTab } from './clientForm/AddressTab';
import { CommercialTab } from './clientForm/CommercialTab';
import { FiscalTab } from './clientForm/FiscalTab';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: DbClient | null;
  totalClients: number;
}

export function ClientFormDialog({ open, onOpenChange, client, totalClients }: Props) {
  const { data: salesReps = [] } = useSalesReps();
  const cnpjLookup = useCnpjLookup();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const [tab, setTab] = useState('identification');
  const [cepLoading, setCepLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<ClientForm>({ ...defaultForm });

  useEffect(() => {
    if (!open) return;
    setTab('identification');
    setErrors({});
    setFormData(client ? clientToForm(client) : { ...defaultForm });
  }, [open, client]);

  const update = (patch: Partial<ClientForm>) => setFormData(p => ({ ...p, ...patch }));

  const dup = useClientDuplicateCheck(formData.document, client?.id ?? null);
  const duplicate = dup.data && dup.data.id !== client?.id ? dup.data : null;

  const setPersonType = (pt: 'PF' | 'PJ') => {
    update({
      person_type: pt,
      document_type: pt === 'PF' ? 'cpf' : 'cnpj',
      document: '',
      ...(pt === 'PF'
        ? { trade_name: '', state_registration: '', municipal_registration: '', cnae_primary: '', cnae_description: '', receita_status: '', receita_status_date: '' }
        : { rg: '', birth_date: '', gender: '' }),
    });
  };

  const handleCnpjLookup = async () => {
    if (formData.person_type !== 'PJ') return;
    const data = await cnpjLookup.lookup(formData.document);
    if (data) {
      update({
        name: data.razao_social,
        trade_name: data.nome_fantasia,
        email: data.email || formData.email,
        phone: data.telefone ? maskPhone(data.telefone) : formData.phone,
        address_street: data.logradouro,
        address_number: data.numero,
        address_complement: data.complemento,
        address_neighborhood: data.bairro,
        address_city: data.municipio,
        address_state: data.uf,
        address_zip_code: maskCEP(data.cep),
        cnae_primary: data.cnae_primary,
        cnae_description: data.cnae_description,
        receita_status: data.receita_status,
        receita_status_date: data.receita_status_date,
      });
    }
  };

  const handleCepLookup = async () => {
    setCepLoading(true);
    const data = await lookupCEP(formData.address_zip_code);
    setCepLoading(false);
    if (data) {
      update({
        address_street: data.street || formData.address_street,
        address_neighborhood: data.neighborhood || formData.address_neighborhood,
        address_city: data.city || formData.address_city,
        address_state: data.state || formData.address_state,
      });
      toastSuccess('Endereço encontrado', `${data.city}/${data.state}`);
    } else {
      toastError('CEP não encontrado');
    }
  };

  const handleSave = () => {
    const e = validateClientForm(formData);
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.name || e.document || e.email || e.phone) setTab('identification');
      else if (e.address_zip_code || e.address_city || e.address_state) setTab('address');
      toastError('Há campos obrigatórios pendentes.', undefined, 'Verifique os campos');
      // QA-UX r6: setTab() pode trocar de aba; o foco precisa esperar o commit.
      scheduleFocusInvalid(() => document.querySelector('[role="dialog"]'));
      return;
    }
    if (duplicate) {
      toastError(`Já existe o cadastro "${duplicate.name}" (${duplicate.code}) com este documento.`, undefined, 'Documento duplicado');
      setTab('identification');
      scheduleFocusInvalid(() => document.querySelector('[role="dialog"]'), 'document');
      return;
    }

    const payload = buildClientPayload(formData);
    if (client) {
      updateClient.mutate({ id: client.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      const code = `CLI${String(totalClients + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
      createClient.mutate({ ...payload, code }, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isSaving = createClient.isPending || updateClient.isPending;
  const hasTabError = (keys: string[]) => keys.some(k => errors[k]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{client ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          <DialogDescription>
            {client ? `Atualize os dados de ${client.name}` : 'Preencha os dados em cada aba para cadastrar um novo cliente.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="identification" className="gap-1.5">
              {hasTabError(['name', 'document', 'email', 'phone']) && <AlertCircle className="h-3 w-3 text-destructive" />}
              Identificação
            </TabsTrigger>
            <TabsTrigger value="address" className="gap-1.5">
              {hasTabError(['address_zip_code', 'address_city', 'address_state']) && <AlertCircle className="h-3 w-3 text-destructive" />}
              Endereço
            </TabsTrigger>
            <TabsTrigger value="commercial">Comercial</TabsTrigger>
            <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-1 py-4">
            <IdentificationTab
              formData={formData}
              update={update}
              errors={errors}
              setPersonType={setPersonType}
              handleCnpjLookup={handleCnpjLookup}
              cnpjLoading={cnpjLookup.loading}
              duplicate={duplicate}
            />
            <AddressTab
              formData={formData}
              update={update}
              errors={errors}
              handleCepLookup={handleCepLookup}
              cepLoading={cepLoading}
            />
            <CommercialTab formData={formData} update={update} salesReps={salesReps} />
            <FiscalTab formData={formData} update={update} />
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {client ? 'Salvar Alterações' : 'Cadastrar Cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
