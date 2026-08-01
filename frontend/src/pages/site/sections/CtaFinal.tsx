import Section from '../../../components/ui/Section';
import Button from '../../../components/ui/Button';

export default function CtaFinal() {
  return (
    <Section tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Seu delivery pode vender enquanto você cozinha
        </h2>
        <p className="mt-4 text-ink-600">
          Configure em uma tarde. Se não fizer sentido para você, devolvemos o
          valor em até 7 dias.
        </p>
        <div className="mt-8 flex justify-center">
          <Button to="/cadastro">Começar agora</Button>
        </div>
        <p className="mt-5 text-sm text-ink-600">
          Sem fidelidade · Cancele quando quiser
        </p>
      </div>
    </Section>
  );
}
