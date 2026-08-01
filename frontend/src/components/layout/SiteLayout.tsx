import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

/**
 * Layout route: envolve apenas as paginas do site publico.
 * O painel fica FORA deste layout — ele tera a propria navegacao no
 * ciclo 3, e nao deve herdar o cabecalho e o rodape institucionais.
 */
export default function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
