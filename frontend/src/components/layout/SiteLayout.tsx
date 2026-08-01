import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

/**
 * Layout route: envolve apenas as paginas do site publico.
 * O painel fica FORA deste layout — ele tera a propria navegacao no
 * ciclo 3, e nao deve herdar o cabecalho e o rodape institucionais.
 */
export default function SiteLayout() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;

    const id = hash.slice(1);
    if (!id) return;

    // Na primeira carga (ou logo apos navegar de outra pagina), o elemento
    // da secao pode ainda nao estar montado no momento deste efeito. Tenta
    // rolar algumas vezes em frames sucessivos ate o elemento aparecer;
    // desiste silenciosamente se ele nunca existir (nao forca rolagem).
    let tentativas = 0;
    let frame: number;

    const tentarRolar = () => {
      const elemento = document.getElementById(id);
      if (elemento) {
        elemento.scrollIntoView();
        return;
      }
      tentativas += 1;
      if (tentativas < 20) {
        frame = requestAnimationFrame(tentarRolar);
      }
    };

    frame = requestAnimationFrame(tentarRolar);

    return () => cancelAnimationFrame(frame);
  }, [hash]);

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
