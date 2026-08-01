type Mensagem = {
  de: 'cliente' | 'ia';
  texto: string;
  audio?: boolean;
};

// Conversa padrao: cliente recorrente que ja sabe o que quer. Usada no Hero.
const CONVERSA_PADRAO: Mensagem[] = [
  { de: 'cliente', texto: 'Áudio · 0:08', audio: true },
  { de: 'ia', texto: 'Oi, Marina! Duas pizzas grandes de calabresa, é isso? Fica R$ 90,00.' },
  { de: 'ia', texto: 'Entrego no endereço de sempre, Rua das Acácias 220? A taxa é R$ 6,00.' },
  { de: 'cliente', texto: 'isso mesmo, vou pagar em dinheiro, tenho 100' },
  { de: 'ia', texto: 'Fechado! Total R$ 96,00, levo R$ 4,00 de troco. Sai em ~35 min. 🍕' },
];

type ConversaDemoProps = {
  nomeLoja?: string;
  avatarLetra?: string;
  mensagens?: Mensagem[];
};

export default function ConversaDemo({
  nomeLoja = 'Pizzaria do Bairro',
  avatarLetra = 'P',
  mensagens = CONVERSA_PADRAO,
}: ConversaDemoProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2.5 border-b border-stone-200 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
          {avatarLetra}
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-800">{nomeLoja}</p>
          <p className="text-xs text-brand-700">respondendo agora</p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {mensagens.map((msg, i) => (
          <li
            key={i}
            className={msg.de === 'cliente' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={[
                'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.de === 'cliente'
                  ? 'rounded-br-sm border border-brand-500/30 bg-brand-50 text-ink-800'
                  : 'rounded-bl-sm border border-stone-200 bg-white text-ink-800',
              ].join(' ')}
            >
              <span className="sr-only">{msg.de === 'cliente' ? 'Cliente: ' : 'Atendimento: '}</span>
              {msg.audio ? (
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                  </svg>
                  {msg.texto}
                </span>
              ) : (
                msg.texto
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-stone-200 pt-3 text-center text-xs text-stone-500">
        Exemplo ilustrativo de atendimento
      </p>
    </div>
  );
}
