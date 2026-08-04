import { Outlet } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import FaixaCota from './FaixaCota';
import MenuLateral from './MenuLateral';

/**
 * Casca comum das telas do painel (/app/*).
 *
 * Existe por causa da faixa de aviso de cota: o spec pede a faixa "no
 * topo de qualquer tela do painel", e ela estava montada só em
 * Assinatura e Créditos — justo as duas telas onde o lojista já veria o
 * saldo de qualquer jeito. No Dashboard, no CRM e no iFood, onde ele
 * passa o dia, não havia aviso nenhum de que a cota acabou e a IA parou
 * de responder no WhatsApp.
 *
 * Montar num lugar só (e não repetir <FaixaCota /> em cinco páginas)
 * garante que a próxima tela do painel já nasça com o aviso.
 *
 * A trava de acesso vem junto porque é a mesma para todas as rotas do
 * painel; assim cada rota volta a declarar só a sua página.
 */
export default function PainelLayout() {
  return (
    <ProtectedRoute exigirAssinatura>
      <div className="md:flex">
        <MenuLateral />
        <div className="min-w-0 flex-1">
          <FaixaCota />
          <Outlet />
        </div>
      </div>
    </ProtectedRoute>
  );
}
