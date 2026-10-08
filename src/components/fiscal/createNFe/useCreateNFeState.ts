import { useEffect, useMemo, useState } from 'react';
import { useClients } from '@/hooks/commercial/useClients';
import { useProducts } from '@/hooks/inventory/useProducts';
import { useFiscalTaxRules } from '@/hooks/fiscal/useFiscalTaxRules';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { calculateTaxes } from '@/shared/utils/fiscalMotor';
import { formatBRL } from '@/lib/formatters';
import { STEPS, type NFeItemForm } from './types';
import type { SmartSelectOption } from '../SmartSelect';

export function useCreateNFeState() {
  const { currentCompany } = useEnterprise();

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientDocument, setClientDocument] = useState('');
  const [clientUF, setClientUF] = useState('');

  const clientsQuery = useClients();
  const originUF = currentCompany?.address_state || '';
  const taxRulesQuery = useFiscalTaxRules(originUF || undefined, clientUF || undefined);
  const productsQuery = useProducts();
  const clients = useMemo(() => clientsQuery.data || [], [clientsQuery.data]);
  const products = useMemo(() => productsQuery.data || [], [productsQuery.data]);
  const taxRules = useMemo(() => taxRulesQuery.data || [], [taxRulesQuery.data]);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [taxCalculationError, setTaxCalculationError] = useState<string | null>(null);

  const [operationType, setOperationType] = useState('saida');
  const [naturezaOp, setNaturezaOp] = useState('Venda de mercadoria');
  const [defaultCfop, setDefaultCfop] = useState('5102');

  const [items, setItems] = useState<NFeItemForm[]>([]);

  const [carrierName, setCarrierName] = useState('');
  const [freightType, setFreightType] = useState('1');
  const [shipping, setShipping] = useState(0);
  const [volumeQty, setVolumeQty] = useState(1);

  const [paymentMethod, setPaymentMethod] = useState('99');
  const [installments, setInstallments] = useState(1);
  const [discount, setDiscount] = useState(0);

  const [diagnosisFilter, setDiagnosisFilter] = useState<'all' | 'errors' | 'warnings'>('all');
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDiagnosisSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!clientUF) return;
    if (!originUF) return;
    const sameState = clientUF === originUF;
    const newCfop = operationType === 'saida' ? (sameState ? '5102' : '6102') : '1102';
    setDefaultCfop(newCfop);
    setItems((prev) => prev.map((i) => ({ ...i, cfop: newCfop })));
  }, [clientUF, operationType, originUF]);

  useEffect(() => {
    const calcAll = () => {
      let calculationError: string | null = null;
      const updated = items.map((it) => {
        if (!it.cfop) return it;
        try {
          const calc = calculateTaxes(
          { price: it.unitPrice, quantity: it.quantity, ncm: it.ncm },
          originUF,
          clientUF,
          taxRulesQuery.data || [],
          currentCompany?.tax_regime || 'simples_nacional',
          'hybrid',
        );
          return {
            ...it,
          icms: calc.icms_value,
          pis: calc.pis_value,
          cofins: calc.cofins_value,
          ipi: calc.ipi_value,
          ibs: calc.ibs_value,
          cbs: calc.cbs_value,
        };
        } catch (err) {
          calculationError = err instanceof Error ? err.message : 'Falha ao calcular tributos.';
          return { ...it, icms: 0, pis: 0, cofins: 0, ipi: 0, ibs: 0, cbs: 0 };
        }
      });
      setTaxCalculationError(calculationError);
      const changed = updated.some((u, i) => u.icms !== items[i]?.icms || u.ibs !== items[i]?.ibs);
      if (changed) setItems(updated);
    };
    if (items.length > 0) calcAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, items.map((i) => `${i.cfop}-${i.quantity}-${i.unitPrice}-${i.ncm}`).join('|'), clientUF, originUF, taxRules, currentCompany?.tax_regime]);

  const clientOptions: SmartSelectOption[] = useMemo(
    () => clients.map((c) => ({
      value: c.id,
      label: c.name,
      description: c.document,
      meta: `${c.address_city || ''}/${c.address_state || ''}`,
    })),
    [clients],
  );

  const productOptions: SmartSelectOption[] = useMemo(
    () => products.map((p) => ({
      value: p.id,
      label: p.name,
      description: `Cód: ${p.code}`,
      meta: formatBRL(p.sale_price),
    })),
    [products],
  );

  const handleSelectClient = (id: string) => {
    const c = clients.find((cl) => cl.id === id);
    if (!c) return;
    setClientId(id);
    setClientName(c.name);
    setClientDocument(c.document);
    setClientUF(c.address_state || '');
  };

  const handleAddProduct = (productId: string) => {
    const p = products.find((pr) => pr.id === productId);
    if (!p) return;
    setItems((prev) => [
      ...prev,
      {
        productCode: p.code,
        productName: p.name,
        productId: p.id,
        ncm: '',
        cfop: defaultCfop,
        unit: p.unit || 'UN',
        quantity: 1,
        unitPrice: p.sale_price,
      },
    ]);
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof NFeItemForm, value: string | number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalIcms = items.reduce((s, i) => s + (i.icms || 0), 0);
  const totalPis = items.reduce((s, i) => s + (i.pis || 0), 0);
  const totalCofins = items.reduce((s, i) => s + (i.cofins || 0), 0);
  const totalIpi = items.reduce((s, i) => s + (i.ipi || 0), 0);
  const total = subtotal - discount + shipping;

  const validationByStep = useMemo(() => {
    const steps: Record<number, { errors: string[]; warnings: string[] }> = {};
    STEPS.forEach((_, i) => (steps[i] = { errors: [], warnings: [] }));

    if (!naturezaOp.trim()) steps[0].errors.push('Natureza da operação é obrigatória para a validade jurídica da NF-e.');
    if (!clientId) steps[1].errors.push('O destinatário é obrigatório. Selecione um cliente da base.');
    if (clientDocument && clientDocument.replace(/\D/g, '').length < 11) steps[1].errors.push('O documento do destinatário (CPF/CNPJ) parece estar incompleto.');
    if (!clientUF) steps[1].errors.push('UF do destinatário não identificada. Verifique o cadastro.');
    if (!originUF) steps[0].errors.push('UF da empresa emissora não configurada.');

    if (items.length === 0) steps[2].errors.push('A nota precisa conter pelo menos um item para ser emitida.');
    items.forEach((item, idx) => {
      if (!item.cfop) steps[2].errors.push(`Item ${idx + 1} (${item.productName}): O código CFOP é obrigatório.`);
      if (!item.ncm) steps[2].warnings.push(`Item ${idx + 1}: NCM não informado. Isso pode causar rejeição pela SEFAZ.`);
      if (item.quantity <= 0) steps[2].errors.push(`Item ${idx + 1}: A quantidade deve ser maior que zero.`);
      if (item.unitPrice <= 0) steps[2].errors.push(`Item ${idx + 1}: O valor unitário não pode ser zero.`);
    });

    if (taxCalculationError) steps[3].errors.push(taxCalculationError);
    if (taxRulesQuery.isError) steps[3].errors.push('Não foi possível consultar as regras fiscais.');
    const totalTax = totalIcms + totalIpi + totalPis + totalCofins;
    if (totalTax === 0 && subtotal > 0) steps[3].warnings.push('Atenção: O valor total de impostos está zerado. Verifique as regras.');

    if (!paymentMethod) steps[5].errors.push('Informe o meio de pagamento utilizado.');
    if (installments < 1) steps[5].errors.push('O número de parcelas deve ser pelo menos 1.');

    return steps;
  }, [naturezaOp, clientId, clientDocument, clientUF, items, paymentMethod, totalIcms, totalIpi, totalPis, totalCofins, subtotal, installments, taxCalculationError, taxRulesQuery.isError, originUF]);

  const allIssues = useMemo(() => {
    const errors: { step: number; message: string }[] = [];
    const warnings: { step: number; message: string }[] = [];
    Object.entries(validationByStep).forEach(([s, data]) => {
      const stepIdx = Number(s);
      data.errors.forEach((m) => errors.push({ step: stepIdx, message: m }));
      data.warnings.forEach((m) => warnings.push({ step: stepIdx, message: m }));
    });
    return { errors, warnings, total: errors.length + warnings.length };
  }, [validationByStep]);

  const hasFilteredErrors = useMemo(
    () => Object.values(validationByStep).some((data) => data.errors.some((err) => err.toLowerCase().includes(diagnosisSearch.toLowerCase()))),
    [validationByStep, diagnosisSearch],
  );
  const hasFilteredWarnings = useMemo(
    () => Object.values(validationByStep).some((data) => data.warnings.some((warn) => warn.toLowerCase().includes(diagnosisSearch.toLowerCase()))),
    [validationByStep, diagnosisSearch],
  );

  const currentStepValidation = validationByStep[step] || { errors: [], warnings: [] };
  const hasBlockingErrors = currentStepValidation.errors.length > 0;
  const hasAnyBlockingErrors = Object.values(validationByStep).some((stepValidation) => stepValidation.errors.length > 0);

  const nothingFoundInView = useMemo(() => {
    if (diagnosisFilter === 'all') return !hasFilteredErrors && !hasFilteredWarnings;
    if (diagnosisFilter === 'errors') return !hasFilteredErrors;
    if (diagnosisFilter === 'warnings') return !hasFilteredWarnings;
    return true;
  }, [diagnosisFilter, hasFilteredErrors, hasFilteredWarnings]);

  return {
    // client
    clientId, clientName, clientDocument, clientUF, handleSelectClient,
    // data
    clientOptions, productOptions,
    // step
    step, setStep, saving, setSaving,
    // info
    operationType, setOperationType, naturezaOp, setNaturezaOp, defaultCfop, setDefaultCfop,
    // items
    items, setItems, handleAddProduct, updateItem, removeItem,
    // transport
    carrierName, setCarrierName, freightType, setFreightType, shipping, setShipping, volumeQty, setVolumeQty,
    // finance
    paymentMethod, setPaymentMethod, installments, setInstallments, discount, setDiscount,
    // totals
    subtotal, totalIcms, totalPis, totalCofins, totalIpi, total,
    // diagnosis
    diagnosisFilter, setDiagnosisFilter, diagnosisSearch, searchTerm, setSearchTerm,
    validationByStep, allIssues, hasFilteredErrors, hasFilteredWarnings,
    currentStepValidation, hasBlockingErrors, hasAnyBlockingErrors, nothingFoundInView,
  };
}
