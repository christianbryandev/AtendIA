import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container';
import Button from '../../components/ui/Button';

export default function Cadastro() {
  return (
    <Container className="py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
        Estamos finalizando os últimos ajustes
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-ink-600">
        O cadastro abre em breve. Se quiser ser avisado assim que abrir, fale com
        a gente — respondemos pessoalmente.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="mailto:christianpereira.mtx@gmail.com">
          Quero ser avisado
        </Button>
        <Button to="/" variant="secondary">Voltar ao início</Button>
      </div>
      <p className="mt-10 text-sm text-ink-600">
        Já tem conta? <Link to="/login" className="font-semibold text-brand-700">Entrar</Link>
      </p>
    </Container>
  );
}
