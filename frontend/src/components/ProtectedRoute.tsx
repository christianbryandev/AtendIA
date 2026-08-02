import { Navigate } from 'react-router-dom';
import { useAssinatura } from '../contexts/AssinaturaContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  exigirAssinatura?: boolean;
}

// 'inadimplente' passa: o Stripe ainda vai retentar a cobrança, e a
// faixa de aviso já comunica a pendência. Mesma regra do middleware do
// backend, que é quem de fato protege os dados.
const STATUS_COM_ACESSO = ['ativa', 'inadimplente'];

export default function ProtectedRoute({ children, exigirAssinatura }: ProtectedRouteProps) {
  const token = localStorage.getItem('auth_token');
  const { status, carregando } = useAssinatura();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!exigirAssinatura) {
    return <>{children}</>;
  }

  if (carregando) {
    return <div className="py-24 text-center text-sm text-ink-600">Carregando…</div>;
  }

  if (!status || !STATUS_COM_ACESSO.includes(status)) {
    return <Navigate to="/assinatura/pagamento" replace />;
  }

  return <>{children}</>;
}
