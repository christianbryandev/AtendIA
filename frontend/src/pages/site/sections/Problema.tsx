import Section from '../../../components/ui/Section';

const HOJE = [
  'O pedido chega no pico e ninguém tem mão livre para responder',
  'O cliente espera dez minutos, desiste e pede no concorrente',
  'A comanda é anotada no papel e sai errada da cozinha',
  'Fora do horário comercial, o WhatsApp simplesmente não responde',
];

const COM_ATENDIA = [
  'Toda mensagem é respondida na hora, inclusive as de áudio',
  'O cliente fecha o pedido sem esperar por ninguém',
  'O pedido chega no painel já formatado, com preço e endereço',
  'Madrugada, domingo e feriado: o atendimento continua de pé',
];

export default function Problema() {
  return (
    <Section tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Todo delivery perde venda no mesmo lugar
        </h2>
        <p className="mt-4 text-ink-600">
          Não é falta de cliente. É falta de alguém livre para responder.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-400">
            Como é hoje
          </h3>
          <ul className="mt-5 space-y-3.5">
            {HOJE.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink-600">
                <span aria-hidden="true" className="mt-0.5 font-bold text-stone-400">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-brand-500 bg-white p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-700">
            Com o AtendIA
          </h3>
          <ul className="mt-5 space-y-3.5">
            {COM_ATENDIA.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink-600">
                <span aria-hidden="true" className="mt-0.5 font-bold text-brand-700">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
