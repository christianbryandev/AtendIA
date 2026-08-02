import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Brand from './Brand';

describe('Brand', () => {
  it('mostra o texto visivel "AtendIA" e nao expoe o icone como img acessivel com o mesmo nome', () => {
    render(<Brand />);

    // O texto visivel e o unico portador do nome acessivel "AtendIA": ele
    // aparece uma vez no DOM...
    expect(screen.getByText('Atend').parentElement).toHaveTextContent('AtendIA');

    // ...e o icone, que antes tinha role="img" + aria-label="AtendIA" (o que
    // faria um leitor de tela anunciar "AtendIA" de novo), agora e
    // decorativo: nao existe nenhum elemento com role acessivel "img" e
    // nome "AtendIA".
    expect(screen.queryByRole('img', { name: 'AtendIA' })).not.toBeInTheDocument();
  });
});
