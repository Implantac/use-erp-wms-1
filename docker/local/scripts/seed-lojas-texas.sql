-- ============================================================================
-- USE ERP (local) — Catálogo Texas Farm Store com fotos + segunda Loja
--
-- Rode DEPOIS de PREPARAR-GRUPO-ZIPO.bat. Idempotente.
--
-- O que faz:
--   * cadastra a filial "Texas Farm Store - Loja 2" (code L2);
--   * cadastra 10 produtos REAIS do site texasfarmstore.com.br, com foto
--     (URL pública do CDN da Loja), preço de venda do site e custo estimado
--     de confecção (55% do preço) nas DUAS empresas do grupo;
--   * monta os saldos para testar na prática:
--       fábrica/CD da indústria -> grupo, CD Loja -> lojas,
--       Loja 1 abaixo do mínimo (pede reposição) e Loja 2 com saldo
--       parado de itens que faltam na Loja 1 (remanejamento);
--   * políticas de reposição das duas lojas apontando para o CD Loja.
--
-- Saldos de abertura locais entram direto em stock_balances (lot_id NULL),
-- como nos demais cadastros locais; os MOVIMENTOS do teste (solicitação,
-- expedição, recebimento, remanejo) passam pelo ledger oficial via RPCs.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_zipo_id uuid;
  v_loja_id uuid;
  v_zipo_br uuid;
  v_loja_cd uuid;
  v_loja_st uuid;
  v_loja2   uuid;
  r record;
BEGIN
  SELECT id INTO v_zipo_id FROM public.companies
  WHERE cnpj = '10.312.467/0001-20' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_loja_id FROM public.companies
  WHERE cnpj = '57.832.353/0001-75' ORDER BY created_at LIMIT 1;
  IF v_zipo_id IS NULL OR v_loja_id IS NULL THEN
    RAISE EXCEPTION 'Grupo Zipo/Texas Farm nao encontrado — rode PREPARAR-GRUPO-ZIPO.bat antes.';
  END IF;
  SELECT id INTO v_zipo_br FROM public.branches
  WHERE company_id = v_zipo_id AND code = 'MATRIZ' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_loja_cd FROM public.branches
  WHERE company_id = v_loja_id AND code = 'CD' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_loja_st FROM public.branches
  WHERE company_id = v_loja_id AND code = 'Loja' ORDER BY created_at LIMIT 1;
  IF v_zipo_br IS NULL OR v_loja_cd IS NULL OR v_loja_st IS NULL THEN
    RAISE EXCEPTION 'Unidades do grupo incompletas — rode PREPARAR-GRUPO-ZIPO.bat antes.';
  END IF;

  -- ------------------------------------------------------------------
  -- Filial: segunda Loja da TEXAS FARM STORE
  -- ------------------------------------------------------------------
  SELECT id INTO v_loja2 FROM public.branches
  WHERE company_id = v_loja_id AND code = 'L2' ORDER BY created_at LIMIT 1;
  IF v_loja2 IS NULL THEN
    INSERT INTO public.branches (
      company_id, name, code, cnpj, tax_regime,
      is_headquarters, is_active, tipo, canal_padrao
    ) VALUES (
      v_loja_id, 'Texas Farm Store - Loja 2', 'L2', '57.832.353/0001-75', 'real',
      false, true, 'filial'::public.branch_tipo,
      'VAREJO_PDV'::public.canal_operacional
    ) RETURNING id INTO v_loja2;
  END IF;

  -- ------------------------------------------------------------------
  -- Catálogo real (site) + saldos do cenário de teste
  -- colunas: code, nome, preco, foto, fabrica, cd, Loja1, Loja2, minimo Loja1
  -- ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('TXF-CM589', 'CAMISETA MASCULINA TEXAS FARM - CM589 - BEGE AREIA/ MARROM CAFE', 147.16,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/10/produto/52447/112794.jpg?ims=fit-in/610x610/filters:fill(white)',
       200, 60, 3, 18, 10),
      ('TXF-CM639', 'CAMISETA MASCULINA TEXAS FARM - CM639 - PRETO/ CARAMELO', 132.91,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/10/produto/52393/112759.jpg?ims=fit-in/610x610/filters:fill(white)',
       200, 40, 0, 45, 8),
      ('TXF-CM485', 'CAMISETA MASCULINA TEXAS FARM - CM485 - VERMELHO BORDO/ OFF-WHITE', 132.91,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/10/produto/52411/112754.jpg?ims=fit-in/610x610/filters:fill(white)',
       180, 35, 5, 9, 10),
      ('TXF-CP009', 'CAMISA COMPETICAO MASCULINA MANGA LONGA TEXAS FARM - CP009 - VERMELHO VINHO/ BEGE', 341.91,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/10/produto/52378/112764.jpg?ims=fit-in/610x610/filters:fill(white)',
       120, 20, 2, 6, 5),
      ('TXF-CIF071', 'CAMISETA INFANTIL FEMININA TEXAS FARM - JUMP ROPE - CIF071 - PRETO/ ROSA', 111.06,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/09/produto/51804/112124.jpg?ims=fit-in/610x610/filters:fill(white)',
       150, 30, 4, 11, 8),
      ('TXF-RT003', 'REGATA CANELADA TEEN TEXAS FARM - JOY - RTTEEN003 - PRETO/ CAQUI', 104.41,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/10/produto/52458/112818.jpg?ims=fit-in/610x610/filters:fill(white)',
       160, 45, 6, 14, 10),
      ('TXF-BOT62030A', 'BOTINA MASCULINA ZEBU - 62030 - NOBUCK AREIA', 423.61,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/09/produto/51593/111958.jpg?ims=fit-in/610x610/filters:fill(white)',
       80, 25, 1, 32, 4),
      ('TXF-BOT62030M', 'BOTINA MASCULINA ZEBU - 62030 - MUSTANG GRAXO', 450.21,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/09/produto/51602/111954.jpg?ims=fit-in/610x610/filters:fill(white)',
       90, 22, 7, 8, 6),
      ('TXF-BOT87060', 'BOTINA FEMININA ZEBU - 87060 - MUSTANG CONHAQUE', 423.61,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/09/produto/51610/111971.jpg?ims=fit-in/610x610/filters:fill(white)',
       85, 18, 3, 10, 5),
      ('TXF-BOT73010', 'BOTINA FEMININA ZEBU - 73010 - MUSTANG TERRA', 423.61,
       'https://texasfarmstore.cdn.magazord.com.br/img/2026/09/produto/51606/111967.jpg?ims=fit-in/610x610/filters:fill(white)',
       70, 15, 2, 5, 4)
    ) AS t(code, nome, preco, foto, q_fab, q_cd, q_loja, q_loja2, minimo)
  LOOP
    INSERT INTO public.products (
      company_id, code, name, type, unit, item_kind,
      sale_price, cost_price, image_url
    )
    SELECT x.c, r.code, r.nome, 'finished', 'un', 'acabado',
           r.preco, round(r.preco * 0.55, 2), r.foto
    FROM (VALUES (v_zipo_id), (v_loja_id)) AS x(c)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.company_id = x.c AND p.code = r.code
    );
    UPDATE public.products
    SET image_url = r.foto, sale_price = r.preco,
        cost_price = round(r.preco * 0.55, 2),
        min_stock = r.minimo, max_stock = r.minimo * 3
    WHERE code = r.code AND company_id IN (v_zipo_id, v_loja_id);

    -- Fábrica/CD da indústria (origem do abastecimento do grupo)
    INSERT INTO public.stock_balances (
      company_id, product_id, lot_id, branch_id, canal_operacional,
      product_code, product_name, quantity, reserved_qty
    )
    SELECT v_zipo_id, p.id, NULL, v_zipo_br, 'ATACADO_INDUSTRIA',
           r.code, r.nome, r.q_fab, 0
    FROM public.products p
    WHERE p.company_id = v_zipo_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.stock_balances b
                      WHERE b.company_id = v_zipo_id AND b.branch_id = v_zipo_br
                        AND b.product_id = p.id AND b.lot_id IS NULL);

    -- CD Loja
    INSERT INTO public.stock_balances (
      company_id, product_id, lot_id, branch_id, canal_operacional,
      product_code, product_name, quantity, reserved_qty
    )
    SELECT v_loja_id, p.id, NULL, v_loja_cd, 'VAREJO_PDV',
           r.code, r.nome, r.q_cd, 0
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.stock_balances b
                      WHERE b.company_id = v_loja_id AND b.branch_id = v_loja_cd
                        AND b.product_id = p.id AND b.lot_id IS NULL);

    -- Loja 1 (abaixo do mínimo em tudo: pede reposição)
    INSERT INTO public.stock_balances (
      company_id, product_id, lot_id, branch_id, canal_operacional,
      product_code, product_name, quantity, reserved_qty
    )
    SELECT v_loja_id, p.id, NULL, v_loja_st, 'VAREJO_PDV',
           r.code, r.nome, r.q_loja, 0
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.stock_balances b
                      WHERE b.company_id = v_loja_id AND b.branch_id = v_loja_st
                        AND b.product_id = p.id AND b.lot_id IS NULL);

    -- Loja 2 (saldo parado nos itens que faltam na Loja 1: remanejo)
    INSERT INTO public.stock_balances (
      company_id, product_id, lot_id, branch_id, canal_operacional,
      product_code, product_name, quantity, reserved_qty
    )
    SELECT v_loja_id, p.id, NULL, v_loja2, 'VAREJO_PDV',
           r.code, r.nome, r.q_loja2, 0
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.stock_balances b
                      WHERE b.company_id = v_loja_id AND b.branch_id = v_loja2
                        AND b.product_id = p.id AND b.lot_id IS NULL);

    -- Políticas: as duas lojas pedem ao CD quando abaixo do mínimo
    INSERT INTO public.replenishment_policies (
      company_id, branch_id, product_id, min_stock, max_stock,
      lead_time_days, replenishment_source_id, is_active
    )
    SELECT v_loja_id, v_loja_st, p.id, r.minimo, r.minimo * 3, 7, v_loja_cd, true
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.replenishment_policies rp
                      WHERE rp.branch_id = v_loja_st AND rp.product_id = p.id);
    INSERT INTO public.replenishment_policies (
      company_id, branch_id, product_id, min_stock, max_stock,
      lead_time_days, replenishment_source_id, is_active
    )
    SELECT v_loja_id, v_loja2, p.id, 5, 20, 7, v_loja_cd, true
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.replenishment_policies rp
                      WHERE rp.branch_id = v_loja2 AND rp.product_id = p.id);
  END LOOP;

  -- ------------------------------------------------------------------
  -- Autoverificação
  -- ------------------------------------------------------------------
  IF (SELECT count(*) FROM public.products
      WHERE code LIKE 'TXF-%' AND image_url IS NOT NULL) < 20 THEN
    RAISE EXCEPTION 'Catalogo Texas Farm incompleto.';
  END IF;
  IF v_loja2 IS NULL THEN
    RAISE EXCEPTION 'Filial Loja 2 nao cadastrada.';
  END IF;
  RAISE NOTICE 'Lojas Texas Farm prontas: catalogo com fotos, Loja 2 e saldos de teste.';
END $$;

COMMIT;
