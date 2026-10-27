-- ============================================================================
-- Correção: DEFAULT de products.item_kind incompatível com o CHECK vigente
--
-- Evidência (harness scripts/live-manager-journey.mjs, 2026-10-19):
--   20260702015616 criou item_kind DEFAULT 'resale' com CHECK em inglês;
--   20260702025203 remapeou os dados e trocou o CHECK para PT-BR
--   ('acabado','materia_prima','servico','kit','insumo','revenda'), mas
--   nenhuma migration atualizou o DEFAULT. Resultado: qualquer INSERT em
--   products que não informe item_kind explicitamente falha com 23514
--   (products_item_kind_check), mesmo o frontend sempre enviando o campo —
--   importações, RPCs e seeds que omitam a coluna quebram.
--
-- Correção mínima: o default passa a ser o equivalente PT-BR do valor
-- original ('resale' -> 'revenda'). Nenhum dado existente é alterado.
-- Reversão: ALTER TABLE public.products ALTER COLUMN item_kind SET DEFAULT 'resale';
-- (não recomendada: reintroduz o defeito).
-- ============================================================================

ALTER TABLE public.products ALTER COLUMN item_kind SET DEFAULT 'revenda';

COMMENT ON COLUMN public.products.item_kind IS
  'Tipo do item: acabado, materia_prima, servico, kit, insumo ou revenda. DEFAULT revenda (corrigido em 20261019120000: o default legado ''resale'' violava o CHECK PT-BR).';
