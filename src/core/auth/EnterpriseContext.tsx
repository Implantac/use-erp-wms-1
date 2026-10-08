import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type MutableRefObject } from 'react';
import { withRenderMonitor } from '@/core/debug/RenderDepthMonitor';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { TenantService, type CompanyRow } from '@/services/admin/TenantService';
import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { useCanalStore } from '@/stores/useCanalStore';
import type { UserRole } from '@/stores/useAppStore';
import { useQueryClient } from '@tanstack/react-query';
import {
  getAllowedChannels,
  getDefaultChannel,
  normalizeUnitType,
  resolveContextSelection,
  type OperationalChannel,
  type OperationalScope,
  type OperationalUnit,
  type OperationalUnitType,
  type SwitchContextInput,
} from './operationalContext';

export type Segment = 'textile' | 'food_factory' | 'pharma' | 'distribution' | 'services' | 'retail' | 'general' | 'fio' | 'tecelagem' | 'animal_feed' | 'industry' | 'wholesaler' | 'retail_chain' | 'franchise' | 'holding' | 'apparel';

export interface TenantRef { id: string; name: string }
export interface GroupRef { id: string; name: string }
export interface BranchRef { 
  id: string; 
  name: string; 
  code?: string; 
  tipo?: 'FACTORY' | 'DISTRIBUTION_CENTER' | 'STORE' | 'industria' | 'filial' | 'cd' | string;
}

interface OperationalUnitSource {
  id: string;
  name: string;
  code?: string | null;
  type?: string | null;
  tipo?: string | null;
  canal_padrao?: string | null;
}

function mapOperationalUnits(units: OperationalUnitSource[]): OperationalUnit[] {
  return units.map((unit) => {
    const unitType = normalizeUnitType(unit.tipo ?? unit.type);
    const defaultChannel = unit.canal_padrao === 'VAREJO_PDV' || unit.canal_padrao === 'ATACADO_INDUSTRIA'
      ? unit.canal_padrao
      : getDefaultChannel(unitType);
    return {
      id: unit.id,
      name: unit.name,
      code: unit.code ?? undefined,
      unitType,
      defaultChannel,
      allowedChannels: getAllowedChannels(unitType),
    };
  });
}

function toBranchRef(unit: OperationalUnit | null): BranchRef | null {
  return unit ? { id: unit.id, name: unit.name, code: unit.code, tipo: unit.unitType } : null;
}


interface HierarchyRow {
  tenant_id: string;
  tenant_name: string;
  enterprise_group_id: string;
  group_name: string;
  company_id: string;
  unit_id: string;
  unit_name: string;
  level: string;
}

export type OperationType = string | { key: string; label?: string };

export interface Policy {
  inventory: {
    allowNegativeStock: boolean;
    autoAdjustmentThreshold: number;
    requiresTransferApproval: boolean;
    minCoverageDays: number;
    replenishmentMethod: 'MIN_MAX' | 'FORECAST' | 'MRP' | 'MANUAL' | 'AI_ASSISTED';
    inventoryAdjustmentPolicy: 'AUTO' | 'MANAGER_APPROVAL' | 'AUDIT_REQUIRED';
    transferApprovalLimit: number;
  };
  commercial: {
    maxDiscountPercentage: number;
    strictCreditCheck: boolean;
    autoOrderApproval: boolean;
    salesCreditCheck: 'NONE' | 'BASIC' | 'STRICT';
  };
  financial: {
    autoReconcile: boolean;
    maxPaymentAdvance: number;
  };
  fiscal: {
    autoInvoiceEmission: boolean;
    homologationMode: boolean;
    taxRegime: string;
    autoTransferInvoice: boolean;
  };
  core: {
    workflowEnabled: boolean;
    eventOrchestrationEnabled: boolean;
    auditLevel: 'NONE' | 'BASIC' | 'FULL';
    taskBoardEnabled: boolean;
  };
}

export interface EnterpriseContextType {
  userId: string | null;
  currentTenant: TenantRef | null;
  currentGroup: GroupRef | null;
  allowedCompanies: CompanyRow[];
  currentCompany: CompanyRow | null;
  currentBranch: BranchRef | null;
  allBranches: BranchRef[];
  allowedUnits: OperationalUnit[];
  activeUnitType: OperationalUnitType | null;
  activeChannel: OperationalChannel;
  scope: OperationalScope;
  role: UserRole | null;
  permissions: string[];
  isMatrixManager: boolean;
  segment: Segment;
  subSegment: string;
  companySize: string;
  taxRegime: string;
  operationTypes: OperationType[];
  policies: Policy;
  isLoading: boolean;
  isSwitching: boolean;
  isReady: boolean;
  error: string | null;
  switchContext: (input: SwitchContextInput) => Promise<void>;
  setCompany: (id: string) => Promise<void>;
  setBranch: (id: string | null) => Promise<void>;
  executiveCouncil: {
    roles: string[];
    mission: string;
  };
}

const EnterpriseContext = createContext<EnterpriseContextType | undefined>(undefined);

export const EnterpriseProvider = React.memo(({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentTenant, setCurrentTenant] = useState<TenantRef | null>(null);
  const [currentGroup, setCurrentGroup] = useState<GroupRef | null>(null);
  const [allowedCompanies, setAllowedCompanies] = useState<CompanyRow[]>([]);
  const [currentCompany, setCurrentCompany] = useState<CompanyRow | null>(null);
  const [currentBranch, setCurrentBranch] = useState<BranchRef | null>(null);
  const [allBranches, setAllBranches] = useState<BranchRef[]>([]);
  const [allowedUnits, setAllowedUnits] = useState<OperationalUnit[]>([]);
  const [activeChannel, setActiveChannel] = useState<OperationalChannel>('CONSOLIDADO');
  const [scope, setScope] = useState<OperationalScope>('CONSOLIDATED');
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [segment, setSegment] = useState<Segment>('general');
  const [subSegment, setSubSegment] = useState<string>('');
  const [companySize, setCompanySize] = useState<string>('Pequeno');
  const [taxRegime, setTaxRegime] = useState<string>('Simples Nacional');
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [policies, setPolicies] = useState<Policy>({
    inventory: {
      allowNegativeStock: false,
      autoAdjustmentThreshold: 10,
      requiresTransferApproval: true,
      minCoverageDays: 7,
      replenishmentMethod: 'MIN_MAX',
      inventoryAdjustmentPolicy: 'MANAGER_APPROVAL',
      transferApprovalLimit: 5000,
    },
    commercial: {
      maxDiscountPercentage: 15,
      strictCreditCheck: true,
      autoOrderApproval: false,
      salesCreditCheck: 'BASIC',
    },
    financial: {
      autoReconcile: false,
      maxPaymentAdvance: 0,
    },
    fiscal: {
      autoInvoiceEmission: false,
      homologationMode: true,
      taxRegime: 'Simples Nacional',
      autoTransferInvoice: true,
    },
    core: {
      workflowEnabled: true,
      eventOrchestrationEnabled: true,
      auditLevel: 'FULL',
      taskBoardEnabled: true,
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const isMatrixManager = role === 'admin_matriz' || role === 'system_admin' || role === 'admin';

  const executiveCouncil = useMemo(() => ({
    roles: [
      'CTO Global', 'Arquiteto SAP S/4HANA', 'Arquiteto SAP Business One',
      'Arquiteto TOTVS Protheus', 'Arquiteto Sankhya', 'Arquiteto Oracle Netsuite',
      'Especialista Microsoft Dynamics', 'Especialista ERP Industrial', 'Especialista PCP/MRP/APS',
      'Especialista WMS/TMS', 'Especialista Fiscal Brasileiro', 'Especialista Contábil',
      'Especialista Supply', 'Especialista IA Empresarial', 'Especialista UX Enterprise'
    ],
    mission: 'Construir uma plataforma ERP Enterprise Multivertical, Multiempresa, Inteligente, Adaptativa, Escalável e Orientada a Dados.'
  }), []);

  const applyCompany = useCallback(async (company: CompanyRow) => {
    if (!company) return;
    
    setCurrentCompany(prev => {
      if (prev?.id === company.id) return prev;
      return { ...company };
    });
    useEnterpriseStore.getState().setActiveCompanyId(company.id);

    const { getEnterprisePolicies } = await import('@/core/orchestration/policyEngine');
    const seg = (company.segment as Segment | null) ?? 'general';
    const nextPolicies = getEnterprisePolicies(seg);
    
    setSegment(prev => prev === seg ? prev : seg);
    setSubSegment(prev => prev === (company.sub_segment ?? '') ? prev : (company.sub_segment ?? ''));
    setCompanySize(prev => prev === (company.company_size ?? 'Pequeno') ? prev : (company.company_size ?? 'Pequeno'));
    setTaxRegime(prev => prev === ((company.tax_regime as string | null) ?? 'Simples Nacional') ? prev : ((company.tax_regime as string | null) ?? 'Simples Nacional'));
    
    setOperationTypes(prev => {
      const next = (company.operation_types as OperationType[] | null) ?? [];
      if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });

    setPolicies(prev => {
      const next = nextPolicies as Policy;
      // Validação de segurança: Sincroniza o regime tributário da empresa com a política fiscal
      if (next.fiscal) {
        next.fiscal.taxRegime = (company.tax_regime as string) || next.fiscal.taxRegime;
      }
      
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
  }, []);

  const isSyncing = useRef(false);
  const lastSyncUser = useRef<string | null>(null);
  const currentCompanyRef = useRef(currentCompany);
  const loadingRef = useRef(isLoading);
  currentCompanyRef.current = currentCompany;
  loadingRef.current = isLoading;

  const loadActiveTenant = useCallback(async (isMounted: MutableRefObject<boolean>) => {
    if (!isMounted.current || isSyncing.current) return;
    
    isSyncing.current = true;
    
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      
      const user = session?.user;

      if (!user) {
        if (isMounted.current) {
          setUserId(null);
          setAllowedCompanies([]);
          setCurrentCompany(null);
          setCurrentBranch(null);
          setAllBranches([]);
          setAllowedUnits([]);
          setActiveChannel('CONSOLIDADO');
          setScope('CONSOLIDATED');
          setRole(null);
          setPermissions([]);
          setIsLoading(false);
          lastSyncUser.current = null;
        }
        return;
      }

      // Check if we already synced this user to avoid loop
      // We compare ID and state to ensure we don't reload during a render cycle
      if (user.id === lastSyncUser.current && currentCompanyRef.current && !loadingRef.current) {
        isSyncing.current = false;
        return;
      }
      
      lastSyncUser.current = user.id;
      setUserId(user.id);
      setIsLoading(true);

      const [companies, profile, userRoleData] = await Promise.all([
        TenantService.getCompanies(),
        TenantService.getUserProfile(user.id),
        TenantService.getUserRole(user.id)
      ]);

      if (!isMounted.current) return;

      // Update global app store with profile/role info once
      const { useAppStore: useStore } = await import('@/stores/useAppStore');
      const storeState = useStore.getState();
      const finalRole = typeof userRoleData === 'string'
        ? userRoleData as NonNullable<ReturnType<typeof useStore.getState>>['userRole']
        : 'viewer';
      const userName = profile?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário';
      setRole(finalRole);
      // No permissions are granted by default. Load explicit, tenant-scoped
      // permissions from an authorized backend before enabling permission gates.
      setPermissions([]);
      setAllowedCompanies(companies ?? []);
      
      const needsUpdate = 
        storeState.user?.id !== user.id || 
        storeState.user?.name !== userName ||
        storeState.userRole !== finalRole ||
        (storeState.user?.permissions?.length ?? 0) > 0 ||
        !storeState.isAuthenticated;

      if (needsUpdate) {
        useStore.setState((state) => {
          if (state.user?.id === user.id && state.userRole === finalRole && state.isAuthenticated && !state.user.permissions?.length) return state;
          
          return {
            ...state,
            user: {
              id: user.id,
              name: userName,
              email: user.email || '',
              role: finalRole,
              permissions: [],
            },
            userRole: finalRole,
            isAuthenticated: true
          } as unknown as ReturnType<typeof useStore.getState>;
        });
      }

      if (companies && companies.length > 0) {
        const company = companies.find(c => c.id === profile?.company_id) || companies[0];
        
        await applyCompany(company as CompanyRow);
        
        const units = await TenantService.getOperationalUnits(company.id);
        
        if (!isMounted.current) return;

        if (units) {
          const operationalUnits = units as unknown as OperationalUnitSource[];
          const canonicalUnits = mapOperationalUnits(operationalUnits);
          const mappedUnits = canonicalUnits.map(toBranchRef).filter((unit): unit is BranchRef => unit !== null);
          setAllowedUnits(canonicalUnits);
          
          setAllBranches(prev => {
            if (prev.length === mappedUnits.length && prev.every((v, i) => v.id === mappedUnits[i].id)) return prev;
            return mappedUnits;
          });
          
          const defaultUnit = canonicalUnits.find(unit => unit.id === profile?.default_branch_id) || canonicalUnits[0] || null;
          const defaultBranch = toBranchRef(defaultUnit);
          
          setCurrentBranch(prev => {
            if (prev?.id === defaultBranch?.id) return prev;
            return defaultBranch ? { ...defaultBranch } : null;
          });
          
          if (defaultBranch) {
            const enterpriseStore = useEnterpriseStore.getState();
            if (enterpriseStore.activeBranchId !== defaultBranch.id) {
              enterpriseStore.setActiveBranchId(defaultBranch.id);
            }
            useCanalStore.getState().setBranchId(defaultBranch.id);
            const defaultChannel = defaultUnit?.defaultChannel ?? 'VAREJO_PDV';
            useCanalStore.getState().setCanal(defaultChannel);
            setActiveChannel(defaultChannel);
            setScope('SINGLE_UNIT');
          } else {
            useEnterpriseStore.getState().setActiveBranchId(null);
            useCanalStore.getState().setBranchId(null);
            useCanalStore.getState().setCanal('CONSOLIDADO');
            setActiveChannel('CONSOLIDADO');
            setScope('CONSOLIDATED');
          }
        }
      }
    } catch (error: unknown) {
      if (isMounted.current) {
        console.error('Enterprise context error:', error);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        isSyncing.current = false;
      }
    }
  }, [applyCompany]);

  const mounted = useRef(true);
  const renderCount = useRef(0);
  
  useEffect(() => {
    mounted.current = true;

    renderCount.current++;
    
    if (renderCount.current > 100) {
      console.warn('[EnterpriseProvider] Excessive re-renders detected in context. Potential loop.');
    }

    const isMounted = mounted;
    
    // Auth state is already hydrated by Supabase; start tenant loading immediately.
    // The sync guard prevents duplicate work when the auth listener fires.
    if (mounted.current && !isSyncing.current) {
      void loadActiveTenant(isMounted);
    }

    // Sync with auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted.current) return;
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Only reload if the user ID has actually changed
        if (session?.user?.id !== lastSyncUser.current) {
          loadActiveTenant(isMounted);
        }
      } else if (event === 'SIGNED_OUT') {
        if (lastSyncUser.current !== null) {
          lastSyncUser.current = null;
          setUserId(null);
          setAllowedCompanies([]);
          setCurrentCompany(null);
          setCurrentBranch(null);
          setAllBranches([]);
          setAllowedUnits([]);
          setActiveChannel('CONSOLIDADO');
          setScope('CONSOLIDATED');
          setRole(null);
          setPermissions([]);
          setIsLoading(false);
          
          // Clear global stores on sign out
          import('@/stores/useAppStore').then(({ useAppStore }) => useAppStore.getState().logout());
          useEnterpriseStore.getState().setActiveCompanyId(null);
          useEnterpriseStore.getState().setActiveBranchId(null);
          useCanalStore.getState().setBranchId(null);
        }
      }
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [loadActiveTenant]);


  const switchContext = useCallback(async (input: SwitchContextInput) => {
    if (isSwitching) return;
    setIsSwitching(true);
    setError(null);

    try {
      const company = allowedCompanies.find((candidate) => candidate.id === input.companyId);
      if (!company) throw new Error('Empresa não autorizada para este usuário.');

      await queryClient.cancelQueries();
      const unitsResult = company.id === currentCompany?.id && allowedUnits.length > 0
        ? allowedUnits
        : mapOperationalUnits((await TenantService.getOperationalUnits(company.id) ?? []) as unknown as OperationalUnitSource[]);
      const selection = resolveContextSelection(unitsResult, input, isMatrixManager);

      await applyCompany(company);
      setAllowedUnits(unitsResult);
      setAllBranches(unitsResult.map(toBranchRef).filter((unit): unit is BranchRef => unit !== null));
      setCurrentBranch(toBranchRef(selection.unit));
      setActiveChannel(selection.channel);
      setScope(selection.scope);

      useEnterpriseStore.getState().setActiveCompanyId(company.id);
      useEnterpriseStore.getState().setActiveBranchId(selection.unit?.id ?? null);
      useCanalStore.getState().setBranchId(selection.unit?.id ?? null);
      useCanalStore.getState().setCanal(selection.channel);

      queryClient.removeQueries();
      await queryClient.invalidateQueries();

      if (userId) {
        const { error: auditError } = await supabase.from('system_audit_logs').insert({
          user_id: userId,
          company_id: company.id,
          action: 'OPERATIONAL_CONTEXT_SWITCHED',
          module: 'core',
          entity_name: 'operational_context',
          entity_id: selection.unit?.id ?? null,
          new_data: {
            company_id: company.id,
            unit_id: selection.unit?.id ?? null,
            channel: selection.channel,
            scope: selection.scope,
          },
        });
        if (auditError) console.warn('Não foi possível registrar a troca de contexto.');
      }
    } catch (switchError) {
      const message = switchError instanceof Error ? switchError.message : 'Não foi possível trocar o contexto operacional.';
      setError(message);
      throw switchError;
    } finally {
      setIsSwitching(false);
    }
  }, [allowedCompanies, allowedUnits, applyCompany, currentCompany?.id, isMatrixManager, isSwitching, queryClient, userId]);

  const setCompany = useCallback(async (id: string) => {
    await switchContext({ companyId: id, scope: 'SINGLE_UNIT' });
  }, [switchContext]);

  const setBranch = useCallback(async (id: string | null) => {
    if (!currentCompany) return;
    await switchContext({
      companyId: currentCompany.id,
      unitId: id,
      scope: id ? 'SINGLE_UNIT' : 'CONSOLIDATED',
    });
  }, [currentCompany, switchContext]);

  const value = useMemo(() => {
    return {
      userId,
      currentTenant,
      currentGroup,
      allowedCompanies,
      currentCompany,
      currentBranch,
      allBranches,
      allowedUnits,
      activeUnitType: allowedUnits.find((unit) => unit.id === currentBranch?.id)?.unitType ?? null,
      activeChannel,
      scope,
      role,
      permissions,
      isMatrixManager,
      segment,
      subSegment,
      companySize,
      taxRegime,
      operationTypes,
      policies,
      isLoading,
      isSwitching,
      isReady: !isLoading && !isSwitching && Boolean(userId && currentCompany),
      error,
      switchContext,
      setCompany,
      setBranch,
      executiveCouncil
    };
  }, [
    userId,
    currentTenant,
    currentGroup,
    allowedCompanies,
    currentCompany,
    currentBranch,
    allBranches,
    allowedUnits,
    activeChannel,
    scope,
    role,
    permissions,
    isMatrixManager,
    segment, 
    subSegment, 
    companySize, 
    taxRegime, 
    operationTypes,
    policies,
    executiveCouncil,
    isLoading,
    isSwitching,
    error,
    switchContext,
    setCompany,
    setBranch
  ]);

  return (
    <EnterpriseContext.Provider value={value}>
      {children}
    </EnterpriseContext.Provider>
  );
});

EnterpriseProvider.displayName = 'EnterpriseProvider';

// eslint-disable-next-line react-refresh/only-export-components
export const useEnterprise = () => {
  const context = useContext(EnterpriseContext);
  if (!context) throw new Error('useEnterprise must be used within EnterpriseProvider');
  return context;
};