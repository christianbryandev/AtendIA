import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const INTERVALO_MS = 2_000;
const LIMITE_MS = 30_000;

export default function Confirmando() {
  const { status, recarregar } = useAssinatura();
  const [desistiu, setDesistiu] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'ativa') {
      navigate('/app/dashboard', { replace: true });
    }
  }, [status, navigate]);

  useEffect(() => {
    if (status === 'ativa') return;

    const pulso = setInterval(() => { void recarregar(); }, INTERVALO_MS);
    const prazo = setTimeout(() => {
      clearInterval(pulso);
      setDesistiu(true);
    }, LIMITE_MS);

    return () => {
      clearInterval(pulso);
      clearTimeout(prazo);
    };
  }, [status, recarregar]);

  return (
    <Container className="py-24">
      <div className="mx-auto max-w-md text-center">
        {desistiu ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-800">
              Pagamento recebido
            </h1>
            <p className="mt-3 text-ink-600">
              Estamos liberando seu acesso. Isso costuma levar menos de um minuto —
              atualize a página ou entre novamente daqui a pouco.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-800">
              Confirmando seu pagamento
            </h1>
            <p className="mt-3 text-ink-600">
              Só um instante. Não feche esta página.
            </p>
          </>
        )}
      </div>
    </Container>
  );
}
