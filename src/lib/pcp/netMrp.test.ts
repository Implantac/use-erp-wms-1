import { describe, expect, it } from 'vitest';
import { calculateNetMaterialNeeds, getOrderNetCoverage } from './netMrp';

const products = [
  { id: 'fabric', code: 'TECIDO', name: 'Tecido cru', unit: 'm', minStock: 0, standardBatchSize: null, leadTimeDays: null },
  { id: 'yarn', code: 'FIO-01', name: 'Fio de urdume', unit: 'kg', minStock: 10, standardBatchSize: 25, leadTimeDays: 5 },
];

describe('calculateNetMaterialNeeds', () => {
  it('exclui reservado e bloqueado e considera compras abertas e segurança', () => {
    const needs = calculateNetMaterialNeeds({
      orders: [{ id: 'op-1', productId: 'fabric', quantity: 100, producedQuantity: 20 }],
      bomLines: [{ productId: 'fabric', componentId: 'yarn', quantity: 2, wastePercentage: 10 }],
      products,
      balances: [
        { productId: 'yarn', quantity: 100, reservedQty: 30, stockStatus: 'available', qualityKnown: true },
        { productId: 'yarn', quantity: 50, reservedQty: 0, stockStatus: 'blocked', qualityKnown: true },
      ],
      purchases: [
        { productId: 'yarn', quantity: 40, receivedQuantity: 10, status: 'confirmed', expectedDelivery: '2026-10-25' },
        { productId: 'yarn', quantity: 500, receivedQuantity: 0, status: 'draft', expectedDelivery: null },
      ],
      requirementDate: '2026-10-21',
    });

    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({
      grossRequirement: 176,
      physicalStock: 150,
      reserved: 30,
      blockedOrUnverified: 50,
      available: 70,
      onOrder: 30,
      draftPurchase: 500,
      safetyStock: 10,
      netRequirement: 86,
      suggestedPurchase: 100,
      lateRisk: true,
      status: 'partial',
    });
  });

  it('não trata rascunho como recebimento programado', () => {
    const needs = calculateNetMaterialNeeds({
      orders: [{ id: 'op-1', productId: 'fabric', quantity: 10, producedQuantity: 0 }],
      bomLines: [{ productId: 'fabric', componentId: 'yarn', quantity: 1, wastePercentage: 0 }],
      products,
      balances: [],
      purchases: [{ productId: 'yarn', quantity: 100, receivedQuantity: 0, status: 'draft', expectedDelivery: null }],
    });
    expect(needs[0].onOrder).toBe(0);
    expect(needs[0].draftPurchase).toBe(100);
    expect(needs[0].status).toBe('unverified');
  });
});

describe('getOrderNetCoverage', () => {
  it('projeta cobertura líquida proporcional da OP', () => {
    const order = { id: 'op-1', productId: 'fabric', quantity: 100, producedQuantity: 0 };
    const bom = [{ productId: 'fabric', componentId: 'yarn', quantity: 1, wastePercentage: 0 }];
    const coverage = getOrderNetCoverage(order, bom, [{
      componentId: 'yarn', materialCode: 'FIO-01', materialName: 'Fio', unit: 'kg',
      grossRequirement: 200, physicalStock: 100, reserved: 0, blockedOrUnverified: 0,
      available: 100, onOrder: 0, draftPurchase: 0, safetyStock: 0, netRequirement: 100,
      suggestedPurchase: 100, leadTimeDays: null, earliestOpenDelivery: null,
      requirementDate: null, lateRisk: false, relatedOPs: ['op-1', 'op-2'], status: 'partial',
    }]);
    expect(coverage.coveragePct).toBe(50);
    expect(coverage.ready).toBe(false);
  });
});


describe('snapshot da OP no MRP', () => {
  it('usa a BOM congelada da OP em vez da BOM atual do produto', () => {
    const needs = calculateNetMaterialNeeds({
      orders: [{
        id: 'op-snapshot', productId: 'fabric', quantity: 10, producedQuantity: 0,
        bomLines: [{ productId: 'fabric', componentId: 'yarn', quantity: 3, wastePercentage: 0 }],
      }],
      bomLines: [{ productId: 'fabric', componentId: 'yarn', quantity: 1, wastePercentage: 0 }],
      products,
      balances: [],
      purchases: [],
    });
    expect(needs[0].grossRequirement).toBe(30);
  });
});
