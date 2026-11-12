import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const fake = vi.hoisted(() => ({ inventory: vi.fn() }));
vi.mock('@/hooks/inventory/useInventoryQuery', () => ({ useInventory: fake.inventory }));
vi.mock('@/shared/components/PageContainer', () => ({ PageContainer: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/shared/components/ExportButton', () => ({ ExportButton: () => <button>Exportar produtos</button> }));
vi.mock('@/shared/components/KPICard', () => ({ KPICard: ({ title, value }: { title: string; value: ReactNode }) => <div>{title}: {value}</div> }));
vi.mock('@/components/inventory/ProductFormDialog', () => ({ ProductFormDialog: () => null }));
import ProductsPage from './Products';

const product = {
  id: 'qa17-product-unit', code: 'QA17-UNIT', name: 'Produto sintetico unitario',
  category_id: 'qa17-category-unit', categoryName: 'Categoria correta da consulta',
  // Campo do OUTRO service: este caminho usa inventoryService/categoryName.
  // Um valor legado divergente nao pode substituir a categoria da listagem.
  category_name: 'Categoria legada incorreta',
  type: 'finished', status: 'active', unit: 'UN', cost_price: 0, sale_price: 0, min_stock: 0,
};
function data(categoryName = product.categoryName) {
  return {
    products: [{ ...product, categoryName, category_id: categoryName ? product.category_id : null }], productsLoading: false,
    // A colecao de filtros e independente da relacao opcional do produto.
    // Sem categoria no produto nao significa cadastrar SelectItem vazio.
    categories: [{ id: product.category_id, name: product.categoryName }], deleteProduct: vi.fn(),
  };
}
async function openDetails() {
  render(<ProductsPage />);
  const row = screen.getByRole('row', { name: /QA17-UNIT/ });
  fireEvent.click(within(row).getAllByRole('button')[0]);
  return { dialog: await screen.findByRole('dialog'), row };
}
beforeEach(() => { vi.clearAllMocks(); fake.inventory.mockReturnValue(data()); });

describe('Produtos — categoria coerente entre listagem e detalhe (QA-17)', () => {
  it('mostra no detalhe a categoria normalizada pelo mesmo service da listagem', async () => {
    const { dialog, row } = await openDetails();
    const category = within(dialog).getByText('Categoria').parentElement;
    expect(category).toHaveTextContent('Categoria correta da consulta');
    expect(category).not.toHaveTextContent('Categoria legada incorreta');
    // O dialog modal torna a tabela aria-hidden; guardar o elemento evita
    // consultar como se ele ainda estivesse acessivel durante o modal.
    expect(row).toHaveTextContent('Categoria correta da consulta');
  });

  it('usa marcador neutro quando a consulta nao retorna nome, sem inventar categoria', async () => {
    fake.inventory.mockReturnValue(data(''));
    const { dialog } = await openDetails();
    const category = within(dialog).getByText('Categoria').parentElement;
    expect(category).toHaveTextContent('Categoria—');
    expect(category).not.toHaveTextContent('Categoria legada incorreta');
  });
});
