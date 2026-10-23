-- FASE 2A: MODELO DE REDE OPERACIONAL (REDE DE LOJAS, FÁBRICA E CD)

-- 1. Enums e Tipos
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_tipo') THEN
        CREATE TYPE public.branch_tipo AS ENUM ('FACTORY', 'DISTRIBUTION_CENTER', 'STORE');
    ELSE
        ALTER TYPE public.branch_tipo ADD VALUE IF NOT EXISTS 'FACTORY';
        ALTER TYPE public.branch_tipo ADD VALUE IF NOT EXISTS 'DISTRIBUTION_CENTER';
        ALTER TYPE public.branch_tipo ADD VALUE IF NOT EXISTS 'STORE';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_transfer_status') THEN
        CREATE TYPE public.stock_transfer_status AS ENUM (
            'DRAFT', 'REQUESTED', 'APPROVED', 'PICKING', 'IN_TRANSIT', 'RECEIVED', 'CONFERRED', 'COMPLETED', 'CANCELLED'
        );
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Garantir coluna de tipo na tabela branches se não existir
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='tipo') THEN
        ALTER TABLE public.branches ADD COLUMN tipo public.branch_tipo DEFAULT 'STORE';
    END IF;
END $$;

-- 3. PDV (Point of Sale) Hierarchy
CREATE TABLE IF NOT EXISTS public.pos_terminals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL, -- active, inactive, maintenance
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    UNIQUE(branch_id, code)
);

CREATE TABLE IF NOT EXISTS public.pos_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id UUID REFERENCES public.pos_terminals(id) ON DELETE CASCADE NOT NULL,
    operator_id UUID REFERENCES auth.users(id) NOT NULL,
    opened_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    closed_at TIMESTAMPTZ,
    opening_balance NUMERIC(15,2) DEFAULT 0 NOT NULL,
    closing_balance NUMERIC(15,2),
    status TEXT DEFAULT 'open' NOT NULL, -- open, closed
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL
);

-- 4. Robust Stock Transfer Orders
CREATE TABLE IF NOT EXISTS public.stock_transfer_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    order_number SERIAL NOT NULL,
    origin_unit_id UUID REFERENCES public.branches(id) NOT NULL,
    destination_unit_id UUID REFERENCES public.branches(id) NOT NULL,
    status public.stock_transfer_status DEFAULT 'DRAFT' NOT NULL,
    requested_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    carrier_id UUID REFERENCES public.carriers(id),
    shipped_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT stock_transfer_diff_units CHECK (origin_unit_id <> destination_unit_id)
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID REFERENCES public.stock_transfer_orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) NOT NULL,
    requested_qty NUMERIC(15,4) NOT NULL,
    picked_qty NUMERIC(15,4) DEFAULT 0,
    shipped_qty NUMERIC(15,4) DEFAULT 0,
    received_qty NUMERIC(15,4) DEFAULT 0,
    divergence_qty NUMERIC(15,4) GENERATED ALWAYS AS (shipped_qty - received_qty) STORED,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Replenishment Policies
CREATE TABLE IF NOT EXISTS public.replenishment_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    min_stock NUMERIC(15,4) DEFAULT 0 NOT NULL,
    max_stock NUMERIC(15,4) DEFAULT 0 NOT NULL,
    safety_stock NUMERIC(15,4) DEFAULT 0 NOT NULL,
    lead_time_days INTEGER DEFAULT 0 NOT NULL,
    replenishment_source_id UUID REFERENCES public.branches(id), -- Default source
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(branch_id, product_id)
);

-- 6. RLS and Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_terminals TO authenticated;
GRANT ALL ON public.pos_terminals TO service_role;
ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_terminals_tenant_isolation" ON public.pos_terminals FOR ALL TO authenticated USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sessions TO authenticated;
GRANT ALL ON public.pos_sessions TO service_role;
ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_sessions_tenant_isolation" ON public.pos_sessions FOR ALL TO authenticated USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_orders TO authenticated;
GRANT ALL ON public.stock_transfer_orders TO service_role;
ALTER TABLE public.stock_transfer_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_transfer_orders_tenant_isolation" ON public.stock_transfer_orders FOR ALL TO authenticated USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
-- [Correcao instalacao local] Havia um ")" excedente no fim desta policy
-- (4 aberturas x 5 fechamentos): o SQL era sintaticamente invalido e nao
-- poderia ter sido aplicado em nenhum banco. Removido o parenteses extra.
CREATE POLICY "stock_transfer_items_tenant_isolation" ON public.stock_transfer_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM stock_transfer_orders o WHERE o.id = transfer_id AND o.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.replenishment_policies TO authenticated;
GRANT ALL ON public.replenishment_policies TO service_role;
ALTER TABLE public.replenishment_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "replenishment_policies_tenant_isolation" ON public.replenishment_policies FOR ALL TO authenticated USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- 7. Audit Comments
COMMENT ON TABLE public.pos_terminals IS 'Terminais de PDV vinculados a Lojas (Operational Units).';
COMMENT ON TABLE public.stock_transfer_orders IS 'Documentos formais de transferência entre unidades da rede (Fábrica, CD, Loja).';
COMMENT ON TABLE public.replenishment_policies IS 'Políticas de ressuprimento por produto e unidade operacional.';
