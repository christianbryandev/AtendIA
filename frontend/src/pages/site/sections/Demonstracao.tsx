import Section from '../../../components/ui/Section';
import ConversaDemo from './ConversaDemo';

const PEDIDO = {
  numero: '#1042',
  cliente: 'Marina S.',
  itens: [{ qtd: 2, nome: 'Pizza Grande Calabresa', valor: 'R$ 90,00' }],
  taxa: 'R$ 6,00',
  total: 'R$ 96,00',
  pagamento: 'Dinheiro — troco para R$ 100,00',
};

export default function Demonstracao() {
  return (
    <Section id="demonstracao">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          O cliente conversa. Você recebe o pedido pronto.
        </h2>
        <p className="mt-4 text-ink-600">
          Enquanto a conversa acontece no WhatsApp, o pedido se monta sozinho no
          seu painel.
        </p>
      </div>

      <div className="mt-14 grid items-start gap-8 lg:grid-cols-2">
        <ConversaDemo />

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <p className="font-semibold text-ink-800">Pedido {PEDIDO.numero}</p>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand-700">
              Novo
            </span>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-600">Cliente</dt>
              <dd className="font-medium text-ink-800">{PEDIDO.cliente}</dd>
            </div>
            {PEDIDO.itens.map((item) => (
              <div key={item.nome} className="flex justify-between">
                <dt className="text-ink-600">{item.qtd}× {item.nome}</dt>
                <dd className="font-medium text-ink-800">{item.valor}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-ink-600">Taxa de entrega</dt>
              <dd className="font-medium text-ink-800">{PEDIDO.taxa}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-3">
              <dt className="font-semibold text-ink-800">Total</dt>
              <dd className="font-bold text-ink-800">{PEDIDO.total}</dd>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-xs text-ink-600">
              {PEDIDO.pagamento}
            </div>
          </dl>

          <p className="mt-4 border-t border-stone-200 pt-3 text-center text-xs text-stone-500">
            Exemplo ilustrativo do painel
          </p>
        </div>
      </div>
    </Section>
  );
}
