import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

// Abaixo desta largura o lojista provavelmente esta no celular, no meio
// do movimento: o menu comeca recolhido para nao tomar a tela toda, e um
// botao abre a lista quando ele precisar navegar. Acima disso (desktop),
// o menu ja comeca aberto — e onde o lojista trabalha o dia inteiro.
const LARGURA_BREAKPOINT_PX = 768;

const ITENS = [
  { rota: '/app/atendimento', rotulo: 'Atendimento', icone: 'fa-comment-dots' },
  { rota: '/app/dashboard', rotulo: 'Visão Geral', icone: 'fa-chart-line' },
  { rota: '/app/crm', rotulo: 'CRM', icone: 'fa-users' },
  { rota: '/app/cardapio', rotulo: 'Cardápio', icone: 'fa-book-open' },
  { rota: '/app/configuracoes', rotulo: 'Configurações', icone: 'fa-gear' },
  { rota: '/app/assinatura', rotulo: 'Assinatura', icone: 'fa-file-invoice-dollar' },
  { rota: '/app/creditos', rotulo: 'Créditos', icone: 'fa-bolt' },
];

/**
 * Navegação lateral do painel: os sete destinos do ciclo 3 mais o botão
 * de sair, que hoje não existe em lugar nenhum do painel — sem ele, sair
 * exigia apagar o token manualmente.
 */
export default function MenuLateral() {
  const [aberto, setAberto] = useState(() => window.innerWidth >= LARGURA_BREAKPOINT_PX);
  const navigate = useNavigate();

  const sair = () => {
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  return (
    <div className="border-b border-stone-200 bg-white md:flex md:min-h-screen md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-4 py-3 md:hidden">
        <span className="flex items-center gap-2 font-bold text-ink-800">
          <i className="fa-solid fa-robot text-brand-700"></i> AtendIA
        </span>
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          className="rounded-lg border border-stone-300 p-2 text-ink-800"
        >
          <i className={`fa-solid ${aberto ? 'fa-xmark' : 'fa-bars'}`}></i>
        </button>
      </div>

      {aberto && (
        <nav aria-label="Menu principal" className="flex flex-col p-4 md:w-64">
          <div className="mb-6 hidden items-center gap-2 px-2 font-bold text-ink-800 md:flex">
            <i className="fa-solid fa-robot text-brand-700"></i> AtendIA
          </div>

          <ul className="flex-1 space-y-1">
            {ITENS.map((item) => (
              <li key={item.rota}>
                <NavLink
                  to={item.rota}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-900'
                        : 'text-ink-600 hover:bg-stone-100 hover:text-ink-800'
                    }`
                  }
                >
                  <i className={`fa-solid ${item.icone} w-4 text-center`}></i>
                  {item.rotulo}
                </NavLink>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={sair}
            className="mt-6 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <i className="fa-solid fa-right-from-bracket w-4 text-center"></i>
            Sair
          </button>
        </nav>
      )}
    </div>
  );
}
