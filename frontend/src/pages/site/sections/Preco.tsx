import Section from '../../../components/ui/Section';
import Button from '../../../components/ui/Button';

const INCLUSO = [
  'IA que atende por texto e áudio, 24 horas',
  'PDV e painel de cozinha em tempo real',
  'Cardápio digital + importação do iFood',
  'CRM com fidelidade e reativação',
  'Pedidos e usuários ilimitados',
];

export default function Preco() {
  return (
    <Section id="preco" tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Um plano, sem pegadinha
        </h2>
        <p className="mt-4 text-ink-600">
          Tudo incluído. Sem taxa de instalação, sem fidelidade.
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 p-7 text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700">
            Plano único
          </span>
          <p className="mt-4 text-5xl font-bold tracking-tight text-ink-800">
            R$ 179,99
            <span className="text-base font-medium text-ink-600"> /mês</span>
          </p>

          <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4 text-left">
            <p className="font-semibold text-brand-700">
              ✓ Teste sem risco por 7 dias
            </p>
            <p className="mt-1 text-sm text-ink-600">
              Se não gostar, devolvemos 100% do valor, sem burocracia.
            </p>
            <p className="mt-3 border-t border-stone-200 pt-3 text-sm font-semibold text-ink-800">
              A cobrança acontece na contratação; se pedir reembolso em até 7
              dias, devolvemos 100% do valor.
            </p>
          </div>

          <Button to="/cadastro" className="mt-5 w-full">Começar agora</Button>
        </div>

        <div className="p-7">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Está tudo incluso
          </h3>
          <ul className="mt-4 space-y-2.5">
            {INCLUSO.map((item) => (
              <li key={item} className="flex gap-2.5 text-[15px] text-ink-600">
                <span aria-hidden="true" className="font-bold text-brand-700">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-stone-100 bg-white p-7">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Sua cota mensal
          </h3>

          <div className="mt-4 space-y-5">
            <div>
              <p className="font-semibold text-ink-800">Atende ≈300 pedidos por mês</p>
              <p className="mt-1 text-sm text-ink-600">
                10.000 créditos de atendimento. Uma resposta em texto usa 1
                crédito; em áudio, 8.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ink-800">100 disparos de campanha</p>
              <p className="mt-1 text-sm text-ink-600">
                Para reativar clientes que pararam de pedir.
              </p>
            </div>
          </div>

          <p className="mt-6 border-t border-dashed border-stone-200 pt-4 text-xs leading-relaxed text-stone-500">
            Precisou de mais? Pacotes avulsos ficam disponíveis dentro do painel.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            Os ≈300 pedidos são uma estimativa de uso médio: o consumo varia
            conforme quanto do seu atendimento for por áudio. O limite contratual
            são os 10.000 créditos.
          </p>
        </div>
      </div>
    </Section>
  );
}
