import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import Button from '../ui/Button';
import Brand from '../brand/Brand';

const NAV = [
  { rotulo: 'Como funciona', href: '/#como-funciona' },
  { rotulo: 'Recursos', href: '/#recursos' },
  { rotulo: 'Preço', href: '/#preco' },
  { rotulo: 'Perguntas', href: '/#perguntas' },
];

export default function Header() {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" aria-label="AtendIA — página inicial" className="flex items-center gap-2">
          <Brand iconClassName="h-8 w-8" textClassName="text-lg" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.rotulo}
              to={item.href}
              className="text-sm font-medium text-ink-600 hover:text-brand-700"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link to="/login" className="text-sm font-medium text-ink-600 hover:text-brand-700">
            Entrar
          </Link>
          <Button to="/cadastro" className="px-5 py-2.5 text-sm">
            Começar agora
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          className="lg:hidden rounded-lg p-2 text-ink-800 hover:bg-stone-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {aberto ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
          </svg>
        </button>
      </Container>

      {aberto && (
        <div className="border-t border-stone-200 bg-white lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <Link
                key={item.rotulo}
                to={item.href}
                onClick={() => setAberto(false)}
                className="rounded-lg px-2 py-2.5 text-sm font-medium text-ink-600 hover:bg-stone-50"
              >
                {item.rotulo}
              </Link>
            ))}
            <Link
              to="/login"
              onClick={() => setAberto(false)}
              className="rounded-lg px-2 py-2.5 text-sm font-medium text-ink-600 hover:bg-stone-50"
            >
              Entrar
            </Link>
            <Button to="/cadastro" className="mt-2">Começar agora</Button>
          </Container>
        </div>
      )}
    </header>
  );
}
