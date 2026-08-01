import Section from '../../../components/ui/Section';

const PASSOS = [
  {
    numero: '1',
    titulo: 'Conecte seu WhatsApp',
    texto: 'Use o mesmo número que seus clientes já conhecem. Não precisa trocar de linha.',
  },
  {
    numero: '2',
    titulo: 'Suba seu cardápio',
    texto: 'Cadastre os produtos no painel ou importe direto do seu iFood.',
  },
  {
    numero: '3',
    titulo: 'A IA atende e vende',
    texto: 'Ela responde texto e áudio, tira dúvidas, calcula entrega e fecha o pedido.',
  },
  {
    numero: '4',
    titulo: 'O pedido cai no painel',
    texto: 'Já formatado, com itens, endereço e forma de pagamento. É só produzir.',
  },
];

export default function ComoFunciona() {
  return (
    <Section id="como-funciona">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Do "oi" ao pedido na cozinha
        </h2>
        <p className="mt-4 text-ink-600">
          Quatro passos para configurar. Depois, funciona sozinho.
        </p>
      </div>

      <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {PASSOS.map((passo) => (
          <li key={passo.numero}>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-lg font-bold text-brand-700">
              {passo.numero}
            </div>
            <h3 className="mt-4 font-semibold text-ink-800">{passo.titulo}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{passo.texto}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
