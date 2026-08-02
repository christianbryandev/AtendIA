import type { ReactNode } from 'react';
import Container from './Container';

export default function Section({
  children,
  id,
  tone = 'white',
  className = '',
}: {
  children: ReactNode;
  id?: string;
  tone?: 'white' | 'muted';
  className?: string;
}) {
  const bg = tone === 'muted' ? 'bg-stone-50' : 'bg-white';
  return (
    <section id={id} className={`${bg} scroll-mt-16 py-16 sm:py-24 ${className}`.trim()}>
      <Container>{children}</Container>
    </section>
  );
}
