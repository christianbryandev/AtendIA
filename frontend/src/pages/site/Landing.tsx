import Hero from './sections/Hero';
import Problema from './sections/Problema';
import ComoFunciona from './sections/ComoFunciona';
import Recursos from './sections/Recursos';
import Demonstracao from './sections/Demonstracao';
import Preco from './sections/Preco';
import Faq from './sections/Faq';
import CtaFinal from './sections/CtaFinal';

export default function Landing() {
  return (
    <>
      <Hero />
      <Problema />
      <ComoFunciona />
      <Recursos />
      <Demonstracao />
      <Preco />
      <Faq />
      <CtaFinal />
    </>
  );
}
