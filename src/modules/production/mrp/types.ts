export interface MaterialNeed {
  materialCode: string;
  materialName: string;
  unit: string;
  totalRequired: number;
  inStock: number;
  reserved: number;
  available: number;
  deficit: number;
  coveragePct: number;
  coverageKnown: boolean;
  relatedOPs: string[];
  status: 'ok' | 'partial' | 'critical' | 'unverified';
  supplier?: string;
}
