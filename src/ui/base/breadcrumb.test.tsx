import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BreadcrumbLink } from './breadcrumb';

/** r16: contrato do componente. JSDOM verifica classes/Slot/ref/nome;
 * dimensoes REAIS sao medidas pelo Chromium em ux:responsive, nao aqui. */
describe('BreadcrumbLink — piso do alvo de toque', () => {
  it('inclui o piso de 24px em ambos os eixos sem alterar href ou nome', () => {
    render(<BreadcrumbLink href="/comercial">Comercial</BreadcrumbLink>);
    const link = screen.getByRole('link', { name: 'Comercial' });
    expect(link).toHaveClass('min-h-6', 'min-w-6');
    expect(link).toHaveAttribute('href', '/comercial');
  });

  it('aplica o piso ao filho real com asChild sem criar uma ancora aninhada', () => {
    const { container } = render(
      <BreadcrumbLink asChild className="focus-visible:ring-2">
        <a href="/wms" className="text-muted-foreground">WMS Avançado</a>
      </BreadcrumbLink>,
    );
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'WMS Avançado' }))
      .toHaveClass('min-h-6', 'min-w-6', 'focus-visible:ring-2', 'text-muted-foreground');
  });

  it('preserva o ref encaminhado para a ancora', () => {
    const ref = createRef<HTMLAnchorElement>();
    render(<BreadcrumbLink ref={ref} href="/compras">Compras</BreadcrumbLink>);
    expect(ref.current).toBe(screen.getByRole('link', { name: 'Compras' }));
  });

  it('mantem Inicio como nome do icone mesmo quando o texto e sr-only', () => {
    render(
      <BreadcrumbLink asChild>
        <a href="/dashboard">
          <svg aria-hidden="true" width="14" height="14" />
          <span className="sr-only">Início</span>
        </a>
      </BreadcrumbLink>,
    );
    const link = screen.getByRole('link', { name: 'Início' });
    expect(link).toHaveClass('min-h-6', 'min-w-6');
    expect(link).toHaveAttribute('href', '/dashboard');
  });
});
