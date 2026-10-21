-- ============================================================================
-- USE ERP (local) — CATÁLOGO DE PRODUTOS POR PROCESSO (empresa BIL).
--
-- Preenche o sistema com os produtos que realmente fazem parte de cada
-- processo têxtil, classificados por categoria. É a categoria que alimenta
-- os filtros das centrais de PCP: urdume/trama só listam a categoria Fios;
-- a prontidão da fiação procura Fibras e Plumas; a da tinturaria, Corantes
-- e Auxiliares. Também classifica os produtos dos testes anteriores.
--
-- Idempotente. Pré-requisito: BIL cadastrada.
-- Uso (psql): -v admin_email='etcsuporte889@gmail.com' -f seed-catalogo-processos.sql
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_company_id uuid;
  c_fibras uuid; c_fios uuid; c_tecidos uuid; c_malhas uuid; c_corantes uuid; c_servicos uuid;
BEGIN
  SELECT id INTO v_company_id
    FROM public.companies
   WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
   ORDER BY created_at LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa BIL nao encontrada: rode antes o cadastro da BIL (CORRIGIR-LOGIN-BIL.bat).';
  END IF;

  -- Categorias por processo: categorias sao POR EMPRESA no banco (RLS);
  -- gravamos explicitamente para a BIL para nao depender do contexto da sessao.
  INSERT INTO public.categories (name, description, company_id)
  SELECT 'Fibras e Plumas', 'Matéria-prima fibrosa de entrada da fiação', v_company_id
   WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Fibras e Plumas' AND company_id = v_company_id);
  INSERT INTO public.categories (name, description, company_id)
  SELECT 'Fios', 'Fios de urdume, trama e malharia', v_company_id
   WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Fios' AND company_id = v_company_id);
  INSERT INTO public.categories (name, description, company_id)
  SELECT 'Tecidos Planos', 'Tecidos planos crus e acabados', v_company_id
   WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Tecidos Planos' AND company_id = v_company_id);
  INSERT INTO public.categories (name, description, company_id)
  SELECT 'Malhas', 'Malhas cruas e acabadas', v_company_id
   WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Malhas' AND company_id = v_company_id);
  INSERT INTO public.categories (name, description, company_id)
  SELECT 'Corantes e Auxiliares', 'Corantes e produtos auxiliares de tinturaria', v_company_id
   WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Corantes e Auxiliares' AND company_id = v_company_id);
  INSERT INTO public.categories (name, description, company_id)
  SELECT 'Serviços de Beneficiamento', 'Tingimento/acabamento para terceiros', v_company_id
   WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Serviços de Beneficiamento' AND company_id = v_company_id);

  SELECT id INTO c_fibras FROM public.categories WHERE name = 'Fibras e Plumas' AND company_id = v_company_id;
  SELECT id INTO c_fios FROM public.categories WHERE name = 'Fios' AND company_id = v_company_id;
  SELECT id INTO c_tecidos FROM public.categories WHERE name = 'Tecidos Planos' AND company_id = v_company_id;
  SELECT id INTO c_malhas FROM public.categories WHERE name = 'Malhas' AND company_id = v_company_id;
  SELECT id INTO c_corantes FROM public.categories WHERE name = 'Corantes e Auxiliares' AND company_id = v_company_id;
  SELECT id INTO c_servicos FROM public.categories WHERE name = 'Serviços de Beneficiamento' AND company_id = v_company_id;

  -- Catálogo por processo (produtos novos, já classificados)
  INSERT INTO public.products (company_id, code, name, type, unit, item_kind, category_id) VALUES
    (v_company_id, 'FIBRA-PES-14',   'Fibra de poliéster 1,4 dtex',      'raw_material', 'kg', 'materia_prima', c_fibras),
    (v_company_id, 'FIO-20-CARD',    'Fio 20/1 cardado',                 'finished',     'kg', 'insumo',        c_fios),
    (v_company_id, 'FIO-30-PENT',    'Fio 30/1 penteado',                'finished',     'kg', 'insumo',        c_fios),
    (v_company_id, 'FIO-PES-150',    'Fio poliéster texturizado 150/48', 'finished',     'kg', 'insumo',        c_fios),
    (v_company_id, 'FIO-MESCLA-30',  'Fio mescla 30/1 algodão/poliéster','finished',     'kg', 'insumo',        c_fios),
    (v_company_id, 'TECIDO-SARJA-21','Tecido sarja 2/1 cru',             'finished',     'm',  'acabado',       c_tecidos),
    (v_company_id, 'TECIDO-POPELINE','Tecido popeline cru',              'finished',     'm',  'acabado',       c_tecidos),
    (v_company_id, 'MALHA-PIQUET',   'Malha piquet crua',                'finished',     'kg', 'acabado',       c_malhas),
    (v_company_id, 'MALHA-MEIA-30',  'Meia-malha 30/1 crua',             'finished',     'kg', 'acabado',       c_malhas),
    (v_company_id, 'CORANTE-PRETO',  'Corante reativo preto',            'raw_material', 'kg', 'insumo',        c_corantes),
    (v_company_id, 'AUX-AMACIANTE',  'Amaciante catiônico',              'raw_material', 'kg', 'insumo',        c_corantes),
    (v_company_id, 'AUX-PURGA',      'Detergente de purga',              'raw_material', 'kg', 'insumo',        c_corantes),
    (v_company_id, 'SERV-TINT-01',   'Serviço de tinturaria (terceiros)','finished',    'kg', 'servico',       c_servicos)
  ON CONFLICT DO NOTHING;

  -- Classifica os produtos que os testes anteriores já criaram: é isto que
  -- impede matéria-prima de outro processo de aparecer no seletor errado.
  UPDATE public.products SET category_id = c_fibras
   WHERE company_id = v_company_id AND category_id IS NULL
     AND code IN ('PLUMA-01', 'PLUMA-INT');
  UPDATE public.products SET category_id = c_fios
   WHERE company_id = v_company_id AND category_id IS NULL
     AND code IN ('FIO-30-CARD', 'FIO-URD-30', 'FIO-TRM-30', 'FIO-INT-30');
  UPDATE public.products SET category_id = c_tecidos
   WHERE company_id = v_company_id AND category_id IS NULL
     AND code IN ('TECIDO-PLANO-01', 'TECIDO-INT-01');
  UPDATE public.products SET category_id = c_malhas
   WHERE company_id = v_company_id AND category_id IS NULL
     AND code IN ('MALHA-30', 'MALHA-INT-30', 'MALHA-TING-30', 'MALHA-INT-TING-30');
  UPDATE public.products SET category_id = c_corantes
   WHERE company_id = v_company_id AND category_id IS NULL
     AND code IN ('CORANTE-AZUL', 'CORANTE-INT-AZUL');

  RAISE NOTICE 'CATALOGO_PROCESSOS_OK: categorias e produtos por processo aplicados.';
END $$;

COMMIT;

SELECT c.name AS categoria, count(p.id) AS produtos
  FROM public.categories c
  LEFT JOIN public.products p ON p.category_id = c.id
 WHERE c.name IN ('Fibras e Plumas', 'Fios', 'Tecidos Planos', 'Malhas', 'Corantes e Auxiliares', 'Serviços de Beneficiamento')
 GROUP BY c.name ORDER BY c.name;
