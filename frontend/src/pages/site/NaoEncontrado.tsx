import Container from '../../components/ui/Container';
import Button from '../../components/ui/Button';

export default function NaoEncontrado() {
  return (
    <Container className="py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">
        Erro 404
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-800">
        Página não encontrada
      </h1>
      <p className="mt-4 text-ink-600">
        O endereço que você tentou acessar não existe ou foi movido.
      </p>
      <Button to="/" className="mt-8">Voltar ao início</Button>
    </Container>
  );
}
