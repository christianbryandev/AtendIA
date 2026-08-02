import Container from '../../../components/ui/Container';
import Button from '../../../components/ui/Button';
import ConversaDemo from './ConversaDemo';

export default function Hero() {
  return (
    <div className="border-b border-stone-200 bg-white py-16 sm:py-24">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-ink-800 sm:text-5xl">
              Seu WhatsApp vendendo sozinho, 24 horas por dia
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-600">
              A IA atende por texto e por áudio, monta o pedido, calcula a
              entrega e o troco — e joga tudo direto no seu PDV. Sem contratar
              mais ninguém.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/cadastro">Começar agora</Button>
              <Button href="#demonstracao" variant="secondary">Ver como funciona</Button>
            </div>
            <p className="mt-5 text-sm text-ink-600">
              Teste sem risco por 7 dias · Cancele quando quiser
            </p>
          </div>

          <ConversaDemo />
        </div>
      </Container>
    </div>
  );
}
