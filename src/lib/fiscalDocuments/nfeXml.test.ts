import { describe, expect, it } from 'vitest';
import type { NFe } from '@/types/fiscal';
import { generateNFeXML } from './nfeXml';

describe('exportação NF-e', () => {
  it('não apresenta como oficial um XML reconstruído com dados incompletos', () => {
    expect(() => generateNFeXML({} as NFe)).toThrow('XML oficial indisponível');
  });
});
