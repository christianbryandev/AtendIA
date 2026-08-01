import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import Logo from '../brand/Logo';

const GRUPOS = [
  {
    titulo: 'Produto',
    links: [
      { rotulo: 'Recursos', href: '/#recursos' },
      { rotulo: 'Preço', href: '/#preco' },
      { rotulo: 'Perguntas', href: '/#perguntas' },
    ],
  },
  {
    titulo: 'Empresa',
    links: [{ rotulo: 'Sobre', href: '/sobre' }],
  },
  {
    titulo: 'Legal',
    links: [
      { rotulo: 'Termos de Uso', href: '/termos' },
      { rotulo: 'Política de Privacidade', href: '/privacidade' },
      { rotulo: 'Exclusão de Dados', href: '/exclusao-de-dados' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-50 py-14">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo variant="icon" className="h-9 w-9" />
              <span className="text-xl font-bold">
                <span className="text-ink-800">Atend</span>
                <span className="text-brand-500">IA</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-ink-600">
              Atendimento por inteligência artificial no WhatsApp para delivery.
            </p>
          </div>

          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                {grupo.titulo}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {grupo.links.map((link) => (
                  <li key={link.rotulo}>
                    <Link
                      to={link.href}
                      className="text-sm text-ink-600 hover:text-brand-700"
                    >
                      {link.rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-stone-200 pt-6 text-xs leading-relaxed text-stone-500">
          <p>67.146.802 CHRISTIAN BRYAN PEREIRA</p>
          <p>CNPJ 67.146.802/0001-85 — Ribeirão Preto/SP</p>
          <p className="mt-2">
            © {new Date().getFullYear()} AtendIA. Todos os direitos reservados.
          </p>
        </div>
      </Container>
    </footer>
  );
}
