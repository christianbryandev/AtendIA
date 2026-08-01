import Container from '../../components/ui/Container';
import Prose from '../../components/ui/Prose';
import termos from '../../content/legal/termos.md?raw';
import privacidade from '../../content/legal/privacidade.md?raw';
import exclusao from '../../content/legal/exclusao-de-dados.md?raw';

const DOCUMENTOS = {
  termos,
  privacidade,
  'exclusao-de-dados': exclusao,
} as const;

export type DocumentoLegal = keyof typeof DOCUMENTOS;

export default function LegalPage({ documento }: { documento: DocumentoLegal }) {
  return (
    <Container className="py-16">
      <article className="mx-auto max-w-3xl">
        <Prose markdown={DOCUMENTOS[documento]} />
      </article>
    </Container>
  );
}
