import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SecurityAudit from './SecurityAudit';

describe('SecurityAudit', () => {
  it('não apresenta selos ou aprovações sem evidência atual', () => {
    render(<SecurityAudit />);
    expect(screen.getByText(/Conformidade não verificada/)).toBeTruthy();
    expect(screen.getAllByText('NÃO VERIFICADO')).toHaveLength(5);
    expect(screen.queryByText('99/100')).toBeNull();
    expect(screen.queryByText('UEEF SEC-LEVEL 3')).toBeNull();
    expect(screen.queryByText('SEGURO')).toBeNull();
    expect(screen.queryByRole('button', { name: /Recalcular Score/ })).toBeNull();
  });
});
