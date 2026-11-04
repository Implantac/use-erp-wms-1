-- ============================================================================
-- Modelos de roteiro têxtil aplicáveis pela empresa (T81/P1)
--
-- Antes, as sequências completas de fiação/tecelagem/tinturaria/acabamento
-- existiam apenas em seeds de teste. A empresa precisava descobrir e digitar
-- operação por operação.
--
-- Esta migration publica o catálogo canônico de modelos e uma RPC para
-- aplicá-lo a um produto da empresa. Aplicar o modelo cria/reutiliza as
-- operações da empresa e cria um roteiro ativo para o produto. Tempos,
-- recursos, receitas e parâmetros continuam zerados/não informados: são da
-- empresa e devem ser configurados depois na rota/OP.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.textile_route_template_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object(
      'key', 'fiacao_completa',
      'label', 'Fiação completa (com maçaroqueira)',
      'description', 'Abertura, limpeza, cardagem, preparação, maçaroqueira, fiação e bobinagem.',
      'sector_kind', 'fiacao',
      'sector_label', 'Fiação',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'ABERTURA', 'name', 'Abertura', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 2, 'operation_key', 'LIMPEZA', 'name', 'Limpeza', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 3, 'operation_key', 'CARDAGEM', 'name', 'Cardagem', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 4, 'operation_key', 'PREPARACAO_FIA', 'name', 'Preparação / Passador', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 5, 'operation_key', 'MACAROQUEIRA', 'name', 'Maçaroqueira', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 6, 'operation_key', 'FILATORIO', 'name', 'Filatório', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 7, 'operation_key', 'BOBINAGEM', 'name', 'Bobinagem / Conicagem', 'sector', 'Fiação', 'sector_kind', 'fiacao')
      )
    ),
    jsonb_build_object(
      'key', 'fiacao_direta',
      'label', 'Fiação direta (sem maçaroqueira)',
      'description', 'Variante para roteiros em que a preparação segue direta ao filatório, quando a empresa usa esse processo.',
      'sector_kind', 'fiacao',
      'sector_label', 'Fiação',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'ABERTURA', 'name', 'Abertura', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 2, 'operation_key', 'LIMPEZA', 'name', 'Limpeza', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 3, 'operation_key', 'CARDAGEM', 'name', 'Cardagem', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 4, 'operation_key', 'PREPARACAO_FIA', 'name', 'Preparação / Passador', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 5, 'operation_key', 'FILATORIO', 'name', 'Filatório', 'sector', 'Fiação', 'sector_kind', 'fiacao'),
        jsonb_build_object('sequence', 6, 'operation_key', 'BOBINAGEM', 'name', 'Bobinagem / Conicagem', 'sector', 'Fiação', 'sector_kind', 'fiacao')
      )
    ),
    jsonb_build_object(
      'key', 'tecelagem_com_engomagem',
      'label', 'Tecelagem com engomagem',
      'description', 'Urdideira, engomagem, preparação dos teares e tecelagem plana.',
      'sector_kind', 'tecelagem',
      'sector_label', 'Tecelagem',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'URDIDEIRA', 'name', 'Urdideira', 'sector', 'Tecelagem', 'sector_kind', 'tecelagem'),
        jsonb_build_object('sequence', 2, 'operation_key', 'ENGOMAGEM', 'name', 'Engomagem', 'sector', 'Tecelagem', 'sector_kind', 'tecelagem'),
        jsonb_build_object('sequence', 3, 'operation_key', 'PREPARACAO_TEARES', 'name', 'Preparação dos teares', 'sector', 'Tecelagem', 'sector_kind', 'tecelagem'),
        jsonb_build_object('sequence', 4, 'operation_key', 'TECELAGEM_PLANA', 'name', 'Tecelagem plana', 'sector', 'Tecelagem', 'sector_kind', 'tecelagem')
      )
    ),
    jsonb_build_object(
      'key', 'tecelagem_sem_engomagem',
      'label', 'Tecelagem sem engomagem',
      'description', 'Urdideira, preparação dos teares e tecelagem plana.',
      'sector_kind', 'tecelagem',
      'sector_label', 'Tecelagem',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'URDIDEIRA', 'name', 'Urdideira', 'sector', 'Tecelagem', 'sector_kind', 'tecelagem'),
        jsonb_build_object('sequence', 2, 'operation_key', 'PREPARACAO_TEARES', 'name', 'Preparação dos teares', 'sector', 'Tecelagem', 'sector_kind', 'tecelagem'),
        jsonb_build_object('sequence', 3, 'operation_key', 'TECELAGEM_PLANA', 'name', 'Tecelagem plana', 'sector', 'Tecelagem', 'sector_kind', 'tecelagem')
      )
    ),
    jsonb_build_object(
      'key', 'malharia_circular',
      'label', 'Malharia circular',
      'description', 'Preparação/alimentação, malharia circular e inspeção da malha crua.',
      'sector_kind', 'malharia',
      'sector_label', 'Malharia',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'PREPARACAO_MALHARIA', 'name', 'Preparação e alimentação do tear circular', 'sector', 'Malharia', 'sector_kind', 'malharia'),
        jsonb_build_object('sequence', 2, 'operation_key', 'MALHARIA_CIRCULAR', 'name', 'Malharia circular', 'sector', 'Malharia', 'sector_kind', 'malharia'),
        jsonb_build_object('sequence', 3, 'operation_key', 'INSPECAO_MALHA_CRUA', 'name', 'Inspeção da malha crua', 'sector', 'Malharia', 'sector_kind', 'malharia')
      )
    ),
    jsonb_build_object(
      'key', 'tinturaria_completa',
      'label', 'Preparação e tinturaria',
      'description', 'Inspeção do cru, preparação, pré-tratamento, tingimento e lavagem/enxágue.',
      'sector_kind', 'tinturaria',
      'sector_label', 'Tinturaria',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'INSPECAO_CRU_TINT', 'name', 'Inspeção do tecido/malha crua', 'sector', 'Tinturaria', 'sector_kind', 'tinturaria'),
        jsonb_build_object('sequence', 2, 'operation_key', 'PREPARACAO_TING', 'name', 'Preparação para tingimento', 'sector', 'Tinturaria', 'sector_kind', 'tinturaria'),
        jsonb_build_object('sequence', 3, 'operation_key', 'PRE_TRATAMENTO', 'name', 'Pré-tratamento', 'sector', 'Tinturaria', 'sector_kind', 'tinturaria'),
        jsonb_build_object('sequence', 4, 'operation_key', 'TINGIMENTO', 'name', 'Tingimento', 'sector', 'Tinturaria', 'sector_kind', 'tinturaria'),
        jsonb_build_object('sequence', 5, 'operation_key', 'LAVAGEM', 'name', 'Lavagem / enxágue', 'sector', 'Tinturaria', 'sector_kind', 'tinturaria')
      )
    ),
    jsonb_build_object(
      'key', 'acabamento_rama',
      'label', 'Acabamento com rama',
      'description', 'Acabamento final, secagem, rama, inspeção final e embalagem.',
      'sector_kind', 'beneficiamento',
      'sector_label', 'Beneficiamento/Acabamento',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'ACABAMENTO_FINAL', 'name', 'Acabamento final', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 2, 'operation_key', 'SECAGEM', 'name', 'Secagem', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 3, 'operation_key', 'RAMA', 'name', 'Rama', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 4, 'operation_key', 'INSPECAO_FINAL', 'name', 'Inspeção final', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 5, 'operation_key', 'EMBALAGEM', 'name', 'Embalagem', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento')
      )
    ),
    jsonb_build_object(
      'key', 'acabamento_compactacao',
      'label', 'Acabamento com compactação',
      'description', 'Acabamento final, secagem, compactação, inspeção final e embalagem.',
      'sector_kind', 'beneficiamento',
      'sector_label', 'Beneficiamento/Acabamento',
      'steps', jsonb_build_array(
        jsonb_build_object('sequence', 1, 'operation_key', 'ACABAMENTO_FINAL', 'name', 'Acabamento final', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 2, 'operation_key', 'SECAGEM', 'name', 'Secagem', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 3, 'operation_key', 'COMPACTACAO', 'name', 'Compactação', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 4, 'operation_key', 'INSPECAO_FINAL', 'name', 'Inspeção final', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento'),
        jsonb_build_object('sequence', 5, 'operation_key', 'EMBALAGEM', 'name', 'Embalagem', 'sector', 'Beneficiamento/Acabamento', 'sector_kind', 'beneficiamento')
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.textile_route_template_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.textile_route_template_catalog() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.textile_route_template_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  template_key text NOT NULL,
  route_id uuid NOT NULL REFERENCES public.production_routes(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT textile_route_template_applications_key_check
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 120),
  CONSTRAINT textile_route_template_applications_company_key_unique UNIQUE (company_id, idempotency_key)
);

ALTER TABLE public.textile_route_template_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS textile_route_template_applications_select ON public.textile_route_template_applications;
CREATE POLICY textile_route_template_applications_select ON public.textile_route_template_applications
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.textile_route_template_applications FROM PUBLIC, anon;
GRANT SELECT ON public.textile_route_template_applications TO authenticated;
GRANT ALL ON public.textile_route_template_applications TO service_role;

CREATE OR REPLACE FUNCTION public.apply_textile_route_template(
  p_product_id uuid,
  p_template_key text,
  p_idempotency_key text,
  p_route_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_product public.products%ROWTYPE;
  v_template jsonb;
  v_existing public.textile_route_template_applications%ROWTYPE;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_route_code text;
  v_route_id uuid;
  v_step jsonb;
  v_operation public.production_steps%ROWTYPE;
  v_active_count int;
  v_created_operations int := 0;
  v_reused_operations int := 0;
  v_step_count int := 0;
  v_company_prefix text;
  v_key_suffix text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'Chave de idempotência da aplicação do modelo inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
    FROM public.textile_route_template_applications
   WHERE company_id = v_company_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.product_id <> p_product_id OR v_existing.template_key <> p_template_key THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada para outro produto/modelo' USING ERRCODE = '23505';
    END IF;
    SELECT count(*)::int INTO v_step_count
      FROM public.production_route_steps
     WHERE company_id = v_company_id AND route_id = v_existing.route_id;
    RETURN jsonb_build_object(
      'route_id', v_existing.route_id,
      'product_id', v_existing.product_id,
      'template_key', v_existing.template_key,
      'step_count', v_step_count,
      'created_operations', 0,
      'reused_operations', v_step_count,
      'idempotent_replay', true
    );
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = p_product_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;

  SELECT item INTO v_template
    FROM jsonb_array_elements(public.textile_route_template_catalog()) item
   WHERE item ->> 'key' = p_template_key;
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'Modelo de roteiro têxtil não encontrado: %', p_template_key USING ERRCODE = '22023';
  END IF;

  v_company_prefix := substr(replace(v_company_id::text, '-', ''), 1, 8);
  v_key_suffix := substr(regexp_replace(v_key, '[^A-Za-z0-9]', '', 'g'), 1, 8);
  IF length(v_key_suffix) < 8 THEN
    v_key_suffix := substr(md5(v_key), 1, 8);
  END IF;

  v_route_code := COALESCE(
    NULLIF(btrim(COALESCE(p_route_code, '')), ''),
    'TPL-' || regexp_replace(upper(p_template_key), '[^A-Z0-9]+', '-', 'g')
      || '-' || regexp_replace(upper(v_product.code), '[^A-Z0-9]+', '-', 'g')
      || '-' || upper(v_key_suffix)
  );

  IF EXISTS (
    SELECT 1 FROM public.production_routes
     WHERE code = v_route_code
       AND NOT (company_id = v_company_id AND product_id = v_product.id)
  ) THEN
    RAISE EXCEPTION 'O código de roteiro % já está em uso', v_route_code USING ERRCODE = '23505';
  END IF;

  -- Cria/reutiliza primeiro todas as operações. Se qualquer nome estiver
  -- ambíguo ou em outro setor, nada é gravado (a função é transacional).
  FOR v_step IN SELECT value FROM jsonb_array_elements(v_template -> 'steps')
  LOOP
    SELECT count(*)::int INTO v_active_count
      FROM public.production_steps
     WHERE company_id = v_company_id AND name = v_step ->> 'name' AND is_active;

    IF v_active_count > 1 THEN
      RAISE EXCEPTION 'A operação % está duplicada nesta empresa; corrija o cadastro antes de aplicar o modelo', v_step ->> 'name'
        USING ERRCODE = '23505';
    ELSIF v_active_count = 1 THEN
      SELECT * INTO v_operation
        FROM public.production_steps
       WHERE company_id = v_company_id AND name = v_step ->> 'name' AND is_active
       LIMIT 1;

      IF NULLIF(btrim(COALESCE(v_operation.sector, '')), '') IS NULL THEN
        UPDATE public.production_steps
           SET sector = v_step ->> 'sector', updated_at = now()
         WHERE id = v_operation.id;
      ELSIF btrim(v_operation.sector) <> v_step ->> 'sector' THEN
        RAISE EXCEPTION 'A operação % já existe com setor %, diferente do modelo (%)', v_step ->> 'name', v_operation.sector, v_step ->> 'sector'
          USING ERRCODE = '23514';
      END IF;
      v_reused_operations := v_reused_operations + 1;
    ELSE
      INSERT INTO public.production_steps (
        company_id, name, code, description, sequence, estimated_time_minutes, sector, is_active
      ) VALUES (
        v_company_id,
        v_step ->> 'name',
        'TPL-' || v_company_prefix || '-' || (v_step ->> 'operation_key'),
        'Operação criada pelo modelo têxtil ' || (v_template ->> 'label') || '; configure tempos e recursos na empresa.',
        (v_step ->> 'sequence')::integer,
        0,
        v_step ->> 'sector',
        true
      );
      v_created_operations := v_created_operations + 1;
    END IF;
  END LOOP;

  INSERT INTO public.production_routes (
    company_id, code, product_id, product_code, product_name,
    version, description, is_active, total_time_minutes
  ) VALUES (
    v_company_id, v_route_code, v_product.id, v_product.code, v_product.name,
    '1.0',
    'Modelo têxtil: ' || (v_template ->> 'label') || '. Configure recursos, tempos, receitas e parâmetros na rota/OP; nenhum valor de processo foi presumido.',
    true, 0
  ) RETURNING id INTO v_route_id;

  FOR v_step IN SELECT value FROM jsonb_array_elements(v_template -> 'steps')
  LOOP
    INSERT INTO public.production_route_steps (
      company_id, route_id, sequence, step_name,
      sector_id, resource_id, setup_time_minutes, operation_time_minutes, description
    ) VALUES (
      v_company_id, v_route_id, (v_step ->> 'sequence')::integer, v_step ->> 'name',
      NULL, NULL, 0, 0,
      'Etapa do modelo ' || (v_template ->> 'label') || '; recurso e tempos devem ser configurados pela empresa.'
    );
    v_step_count := v_step_count + 1;
  END LOOP;

  UPDATE public.products
     SET production_route_id = v_route_id, updated_at = now()
   WHERE id = v_product.id AND company_id = v_company_id;

  INSERT INTO public.textile_route_template_applications (
    company_id, idempotency_key, product_id, template_key, route_id, created_by
  ) VALUES (
    v_company_id, v_key, v_product.id, p_template_key, v_route_id, v_user_id
  );

  RETURN jsonb_build_object(
    'route_id', v_route_id,
    'route_code', v_route_code,
    'product_id', v_product.id,
    'template_key', p_template_key,
    'step_count', v_step_count,
    'created_operations', v_created_operations,
    'reused_operations', v_reused_operations,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_textile_route_template(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_textile_route_template(uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.textile_route_template_catalog() IS
  'Catálogo canônico de modelos de roteiro têxtil (sem tempos, receitas ou parâmetros presumidos).';
COMMENT ON FUNCTION public.apply_textile_route_template(uuid, text, text, text) IS
  'Aplica um modelo têxtil a um produto criando/reutilizando operações e um roteiro ativo da empresa.';
