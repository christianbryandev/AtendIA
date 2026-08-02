import Logo from './Logo';

type BrandProps = {
  iconClassName?: string;
  textClassName?: string;
};

/**
 * Bloco de marca (icone + wordmark "AtendIA") usado no cabecalho e no rodape.
 *
 * O icone da Logo tem role="img" + aria-label="AtendIA" por padrao (para uso
 * isolado). Aqui, ao lado do texto visivel "AtendIA", isso faria um leitor de
 * tela anunciar o nome duas vezes. Por isso o icone e marcado como decorativo
 * (aria-hidden) e o texto visivel passa a ser o unico nome acessivel do bloco.
 */
export default function Brand({ iconClassName = 'h-8 w-8', textClassName = 'text-lg' }: BrandProps) {
  return (
    <span className="flex items-center gap-2">
      <Logo className={iconClassName} aria-hidden="true" />
      <span className={`font-bold ${textClassName}`}>
        <span className="text-ink-800">Atend</span>
        {/* brand-500 sobre branco da 2,6:1 de contraste, abaixo do minimo
            WCAG AA de 4,5:1 para texto (ver src/design/contrast.test.ts).
            Em qualquer outro lugar isso seria bug — e por isso Button.tsx
            usa brand-700, nao brand-500, para texto normal. Aqui e
            excecao deliberada: "IA" faz parte do logotipo/wordmark da
            marca, e o WCAG isenta texto de logotipo do requisito de
            contraste. Nao troque a cor achando que e um bug esquecido. */}
        <span className="text-brand-500">IA</span>
      </span>
    </span>
  );
}
