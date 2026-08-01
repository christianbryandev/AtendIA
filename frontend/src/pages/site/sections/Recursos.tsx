import Section from '../../../components/ui/Section';

const DESTAQUES = [
  {
    titulo: 'Entende e responde em áudio',
    texto:
      'Seu cliente manda áudio porque é mais rápido que digitar. A IA ouve, entende e responde em áudio também — com voz natural, não robotizada. É o que mais diferencia o atendimento.',
  },
  {
    titulo: 'PDV e cozinha em tempo real',
    texto:
      'Os pedidos aparecem no painel conforme chegam e caminham pelos status até a entrega. Controle de caixa incluído, com abertura e fechamento.',
  },
  {
    titulo: 'CRM que traz o cliente de volta',
    texto:
      'Cada cliente tem histórico, total gasto e pontos de fidelidade. Quem parou de pedir entra em campanha automática de reativação com cupom.',
  },
];

const SECUNDARIOS = [
  'Importação de cardápio do iFood',
  'Pagamento por PIX',
  'Cálculo automático de taxa de entrega',
  'Cálculo de troco',
  'Cardápio digital com fotos',
  'Complementos e adicionais',
  'Controle de disponibilidade por produto',
  'Múltiplos usuários no painel',
  'Histórico completo de pedidos',
  'Tom de voz da IA configurável',
  'Instruções personalizadas por loja',
  'Repetição de pedido em um clique',
];

export default function Recursos() {
  return (
    <Section id="recursos" tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Tudo que o delivery precisa, num lugar só
        </h2>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {DESTAQUES.map((item) => (
          <div key={item.titulo} className="rounded-lg border border-stone-200 bg-white p-7">
            <h3 className="text-lg font-semibold text-ink-800">{item.titulo}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{item.texto}</p>
          </div>
        ))}
      </div>

      <ul className="mt-8 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECUNDARIOS.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] text-ink-600">
            <span aria-hidden="true" className="font-bold text-brand-700">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}
