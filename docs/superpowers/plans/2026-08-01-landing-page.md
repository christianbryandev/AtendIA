# Landing Page do AtendIA — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a landing page pública do AtendIA e as páginas institucionais/legais, deixando a rota `/cadastro` pronta para receber o cadastro real no próximo ciclo.

**Architecture:** Landing e painel no mesmo app React, separados por code splitting na fronteira `/app/*`. O site (`pages/site/`) carrega imediatamente; o painel (`pages/app/`) só chega via `React.lazy`. Design system centralizado em tokens do Tailwind, consumido tanto pelo site quanto pelo painel futuro.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS 3, react-router-dom 7, Vitest + Testing Library, react-markdown + remark-gfm.

**Spec:** `docs/superpowers/specs/2026-08-01-landing-page-design.md`

## Global Constraints

Requisitos válidos para **todas** as tarefas. Valores copiados literalmente da spec.

- **Cores (tailwind.config.js):** `brand: { 50:'#ECFDF5', 500:'#10B981', 700:'#047857', 900:'#064E3B' }`, `ink: { 600:'#57534E', 800:'#292524' }`
- **Regra dos dois verdes:** `#10B981` **nunca** recebe texto branco por cima (contraste 2,6:1). Qualquer elemento com texto usa `brand-700` (`#047857`, contraste 5,6:1). `brand-500` só em ícones, ilustrações e fundos.
- **Tipografia:** Inter via `@fontsource/inter` (local). **Proibido Google Fonts** — envia IP do visitante sem consentimento.
- **Sem gradientes.** Cantos 8px (`rounded-lg`), sombras discretas.
- **Zero prova social.** Nenhum contador de clientes, depoimento, logo de cliente, métrica de vendas ou selo. Não inventar números.
- **Preço exato:** `R$ 179,99` por mês.
- **Oferta, texto exato:** `Teste sem risco por 7 dias — não gostou, devolvemos 100% do valor`
- **Cota exata:** `10.000 créditos` de IA e `100 disparos` de campanha por mês. Ilustração `≈300 pedidos` sempre com "≈" e com a nota de rodapé obrigatória.
- **CTA principal:** texto `Começar agora`, destino `/cadastro`.
- **Rodapé, texto exato:** `67.146.802 CHRISTIAN BRYAN PEREIRA — CNPJ 67.146.802/0001-85`
- **Sem urgência falsa:** nada de contador regressivo, "só hoje", "últimas vagas".
- Todo texto visível em **português brasileiro**.

---

## Estrutura de Arquivos

```
frontend/src/
├── content/legal/            # fonte única do texto legal publicável
│   ├── termos.md
│   ├── privacidade.md
│   └── exclusao-de-dados.md
├── design/
│   └── contrast.ts           # cálculo WCAG, usado pelos testes
├── components/
│   ├── brand/Logo.tsx        # SVG tricolor
│   ├── ui/                   # Button, Container, Section, Prose
│   └── layout/               # Header, Footer, SiteLayout
├── pages/site/
│   ├── Landing.tsx           # monta as seções
│   ├── LegalPage.tsx         # renderiza markdown
│   ├── Sobre.tsx
│   ├── Cadastro.tsx          # placeholder
│   └── sections/             # Hero, Problema, ComoFunciona, Recursos,
│                             # Demonstracao, Preco, Faq, CtaFinal
├── pages/app/                # painel — páginas atuais movidas, lazy
└── App.tsx                   # rotas + code splitting
```

**Por que `sections/` separado:** cada seção da landing é independente, tem seu próprio teste de conteúdo e muda por motivos diferentes. Um arquivo único de 800 linhas seria mais difícil de revisar e de editar com precisão.

---

## Task 1: Fundação — testes, tokens e tipografia

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/design/contrast.ts`
- Create: `frontend/src/test/setup.ts`
- Test: `frontend/src/design/contrast.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa)
- Produces: `contrastRatio(hexA: string, hexB: string): number`; tokens Tailwind `brand-{50,500,700,900}` e `ink-{600,800}`; comando `npm test`

- [ ] **Step 1: Instalar dependências**

```bash
cd frontend
npm install react-router-dom@^7.18.2 @fontsource/inter
npm install -D vitest@^3 jsdom @testing-library/react@^16 @testing-library/jest-dom @testing-library/user-event
```

`react-router-dom` estava em `devDependencies` — é dependência de runtime e quebraria o build de produção. Este comando o reinstala no lugar certo.

- [ ] **Step 2: Escrever o teste que falha**

Crie `frontend/src/design/contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('calcula o contraste de preto sobre branco como 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('brand-700 sobre branco passa no WCAG AA (>= 4.5)', () => {
    expect(contrastRatio('#047857', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('brand-500 sobre branco NAO passa — por isso nunca recebe texto', () => {
    expect(contrastRatio('#10B981', '#FFFFFF')).toBeLessThan(4.5);
  });

  it('ink-600 sobre branco passa no WCAG AA', () => {
    expect(contrastRatio('#57534E', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
```

Este teste transforma a "regra dos dois verdes" em algo verificável: se alguém trocar `brand-700` por um verde mais claro, o teste quebra.

- [ ] **Step 3: Configurar o Vitest**

Substitua `frontend/vite.config.ts` por:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

Crie `frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Adicione o script em `frontend/package.json`, dentro de `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

```bash
npm test
```

Esperado: FALHA com `Failed to resolve import "./contrast"`.

- [ ] **Step 5: Implementar o cálculo de contraste**

Crie `frontend/src/design/contrast.ts`:

```ts
/**
 * Contraste WCAG 2.1 entre duas cores hexadecimais.
 * Usado pelos testes para garantir que nenhum par cor/texto do design
 * system fique abaixo do minimo legivel (AA = 4.5 para texto normal).
 */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Cor hexadecimal invalida: ${hex}`);
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npm test
```

Esperado: PASSA — 4 testes.

- [ ] **Step 7: Aplicar os tokens no Tailwind**

Substitua `frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // brand-500 e a cor da logo: ICONES E FUNDOS APENAS.
        // Texto branco sobre ela tem contraste 2,6:1 (reprova WCAG AA).
        // Botoes e qualquer elemento com texto usam brand-700 (5,6:1).
        brand: { 50: '#ECFDF5', 500: '#10B981', 700: '#047857', 900: '#064E3B' },
        ink: { 600: '#57534E', 800: '#292524' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 8: Carregar a fonte localmente**

Substitua `frontend/src/index.css`:

```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    scroll-behavior: smooth;
  }
  body {
    @apply bg-white text-ink-800 font-sans antialiased;
  }
}
```

- [ ] **Step 9: Confirmar que o build funciona**

```bash
npm run build
```

Esperado: build conclui sem erro.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tailwind.config.js frontend/src/index.css frontend/src/design/ frontend/src/test/
git commit -m "feat(frontend): Adiciona infra de teste, tokens do design system e fonte local

Instala Vitest e Testing Library, que nao existiam no projeto. Move
react-router-dom de devDependencies para dependencies: e dependencia de
runtime e quebraria o build de producao.

O helper de contraste transforma a regra dos dois verdes em teste: o
verde da logo reprova no WCAG AA com texto branco (2,6:1), entao botoes
usam a variante escura (5,6:1). Se alguem clarear o token, o teste quebra.

Fonte Inter carregada localmente em vez de Google Fonts, que enviaria o
IP de cada visitante sem consentimento."
```

---

## Task 2: Logo SVG tricolor

**Files:**
- Create: `frontend/src/components/brand/Logo.tsx`
- Test: `frontend/src/components/brand/Logo.test.tsx`
- Delete: `public/logo.png`
- Reference: `C:\Users\chris\Downloads\png-to-svg-converter.svg`

**Interfaces:**
- Consumes: tokens do Task 1
- Produces: `<Logo variant="full" | "icon" className?: string />`

**Contexto:** o vetor original não existe. O arquivo disponível é auto-trace monocromático com 14 sub-traçados num único `<path>`. Divide-se por faixa de coordenada: ícone tem `y < 730`; o restante é a wordmark, sendo `M 844,800` (letra I) e `M 943,731` / `M 961,775` (letra A e seu contorno) o bloco "IA".

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/src/components/brand/Logo.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Logo from './Logo';

describe('Logo', () => {
  it('usa as tres cores da marca na versao completa', () => {
    const { container } = render(<Logo variant="full" />);
    const fills = Array.from(container.querySelectorAll('path')).map((p) =>
      p.getAttribute('fill')
    );
    expect(fills).toContain('#10B981'); // icone
    expect(fills).toContain('#292524'); // "Atend"
    expect(fills.filter((f) => f === '#10B981').length).toBeGreaterThanOrEqual(2); // icone + "IA"
  });

  it('renderiza apenas o icone na variante icon', () => {
    const { container } = render(<Logo variant="icon" />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('tem rotulo acessivel', () => {
    const { container } = render(<Logo variant="full" />);
    expect(container.querySelector('title')?.textContent).toBe('AtendIA');
  });

  it('nao tem fundo branco solido', () => {
    const { container } = render(<Logo variant="full" />);
    const rects = container.querySelectorAll('rect[fill="#FFFFFF"], rect[fill="#fff"]');
    expect(rects).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- Logo
```

Esperado: FALHA com `Failed to resolve import "./Logo"`.

- [ ] **Step 3: Extrair os três grupos de traçado automaticamente**

O `d` do auto-trace tem mais de 5.000 caracteres e 14 sub-caminhos. Separar à mão é convite a erro — rode este script, que divide por faixa de coordenada e imprime os três grupos prontos para colar:

```bash
cd "C:/Users/chris/Downloads/PROJETO DELIVERY"
node -e "
const fs = require('fs');
const svg = fs.readFileSync('C:/Users/chris/Downloads/png-to-svg-converter.svg','utf8');
const d = svg.match(/ d=\"([^\"]+)\"/)[1];

// Cada sub-caminho comeca com M seguido das coordenadas iniciais.
const subs = d.split(/(?=M )/).map(s => s.trim()).filter(Boolean);

const grupo = { icone: [], atend: [], ia: [] };
for (const s of subs) {
  const [, x, y] = s.match(/^M\s+([\d.]+)\s+([\d.]+)/).map(Number);
  if (y < 730 && x < 850) grupo.icone.push(s);        // cloche + balao
  else if (x >= 840) grupo.ia.push(s);                 // letras I e A finais
  else grupo.atend.push(s);                            // A t e n d
}

for (const [nome, partes] of Object.entries(grupo)) {
  console.log('\n===== ' + nome.toUpperCase() + ' (' + partes.length + ' sub-caminhos) =====');
  console.log(partes.join(' '));
}
" > logo-paths.txt
```

Abra `logo-paths.txt`. Confira a contagem antes de prosseguir — o esperado é **ícone: 3, atend: 8, ia: 3**. Se divergir, ajuste os limites de corte e rode de novo.

- [ ] **Step 4: Implementar o componente**

Crie `frontend/src/components/brand/Logo.tsx`, colando cada grupo do `logo-paths.txt` na constante correspondente:

```tsx
type LogoProps = {
  variant?: 'full' | 'icon';
  className?: string;
};

// Tracados extraidos do auto-trace da logo (o vetor original nao existe),
// separados pelo script do passo anterior: icone acima de y=730, wordmark
// abaixo, e "IA" a partir de x=840.
const ICON_PATH = '<colar grupo ICONE do logo-paths.txt>';
const WORDMARK_ATEND_PATH = '<colar grupo ATEND do logo-paths.txt>';
const WORDMARK_IA_PATH = '<colar grupo IA do logo-paths.txt>';

export default function Logo({ variant = 'full', className }: LogoProps) {
  const isIcon = variant === 'icon';

  return (
    <svg
      viewBox={isIcon ? '400 300 460 420' : '180 300 900 600'}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AtendIA"
      className={className}
    >
      <title>AtendIA</title>
      <path d={ICON_PATH} fill="#10B981" fillRule="evenodd" />
      {!isIcon && (
        <>
          <path d={WORDMARK_ATEND_PATH} fill="#292524" fillRule="evenodd" />
          <path d={WORDMARK_IA_PATH} fill="#10B981" fillRule="evenodd" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npm test -- Logo
```

Esperado: PASSA — 4 testes.

- [ ] **Step 6: Conferir visualmente**

```bash
npm run dev
```

Renderize `<Logo variant="full" className="w-64" />` temporariamente em `App.tsx` e confirme no navegador: ícone verde, "Atend" cinza-escuro, "IA" verde, fundo transparente. Ajuste o `viewBox` se houver corte. Remova o teste visual depois.

- [ ] **Step 7: Limpar e remover a logo antiga**

```bash
rm logo-paths.txt
git rm public/logo.png
```

O `logo.png` era a versão em gradiente roxo/laranja, incompatível com o design system (que proíbe gradientes) e com a identidade verde.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/brand/
git commit -m "feat(frontend): Adiciona componente Logo em SVG tricolor

O vetor original da logo nao existe; o arquivo disponivel e um auto-trace
monocromatico com 14 sub-tracados num unico path. Divididos por faixa de
coordenada em icone, 'Atend' e 'IA', e recoloridos conforme o design
system. Curvas sao aproximadas, aceitavel para web.

Remove public/logo.png, que era a versao antiga em gradiente roxo/laranja
— incompativel com a identidade verde e com a regra de nao usar gradiente."
```

---

## Task 3: Componentes de UI base

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Container.tsx`
- Create: `frontend/src/components/ui/Section.tsx`
- Test: `frontend/src/components/ui/Button.test.tsx`

**Interfaces:**
- Consumes: tokens do Task 1
- Produces:
  - `<Button variant="primary" | "secondary" as="button" | "link" to?: string />`
  - `<Container className?: string />` — largura máxima e padding lateral
  - `<Section id?: string tone="white" | "muted" className?: string />`

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/src/components/ui/Button.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Button from './Button';

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Button', () => {
  it('renderiza o texto', () => {
    wrap(<Button>Começar agora</Button>);
    expect(screen.getByRole('button', { name: 'Começar agora' })).toBeInTheDocument();
  });

  it('usa brand-700 no variant primary, nunca brand-500', () => {
    wrap(<Button variant="primary">Começar agora</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-brand-700');
    expect(btn.className).not.toContain('bg-brand-500');
  });

  it('vira link quando recebe "to"', () => {
    wrap(<Button to="/cadastro">Começar agora</Button>);
    const link = screen.getByRole('link', { name: 'Começar agora' });
    expect(link).toHaveAttribute('href', '/cadastro');
  });

  it('aceita classes adicionais', () => {
    wrap(<Button className="w-full">Ok</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- Button
```

Esperado: FALHA com `Failed to resolve import "./Button"`.

- [ ] **Step 3: Implementar os três componentes**

Crie `frontend/src/components/ui/Button.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  to?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit';
};

const BASE =
  'inline-flex items-center justify-center rounded-lg px-6 py-3 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

// brand-700 e nao brand-500: texto branco sobre o verde da logo tem
// contraste 2,6:1, abaixo do minimo WCAG AA de 4,5:1.
const VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-900',
  secondary: 'bg-white text-ink-800 border border-stone-300 hover:bg-stone-50',
} as const;

export default function Button({
  children,
  variant = 'primary',
  to,
  href,
  onClick,
  className = '',
  type = 'button',
}: ButtonProps) {
  const classes = `${BASE} ${VARIANTS[variant]} ${className}`.trim();

  if (to) {
    return <Link to={to} className={classes}>{children}</Link>;
  }
  if (href) {
    return <a href={href} className={classes}>{children}</a>;
  }
  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
```

Crie `frontend/src/components/ui/Container.tsx`:

```tsx
import type { ReactNode } from 'react';

export default function Container({
  children,
  className = '',
}: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`.trim()}>
      {children}
    </div>
  );
}
```

Crie `frontend/src/components/ui/Section.tsx`:

```tsx
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
    <section id={id} className={`${bg} py-16 sm:py-24 ${className}`.trim()}>
      <Container>{children}</Container>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npm test -- Button
```

Esperado: PASSA — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat(frontend): Adiciona Button, Container e Section

O teste do Button trava a regra de contraste no nivel do componente:
variant primary precisa usar brand-700 e nao pode usar brand-500, cujo
contraste com texto branco reprova no WCAG AA."
```

---

## Task 4: Header e Footer

**Files:**
- Create: `frontend/src/components/layout/Header.tsx`
- Create: `frontend/src/components/layout/Footer.tsx`
- Create: `frontend/src/components/layout/SiteLayout.tsx`
- Test: `frontend/src/components/layout/Footer.test.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 2), `Button`, `Container` (Task 3)
- Produces: `<SiteLayout>{children}</SiteLayout>` — envolve Header + main + Footer

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/src/components/layout/Footer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from './Footer';

const wrap = () => render(<MemoryRouter><Footer /></MemoryRouter>);

describe('Footer', () => {
  it('exibe a razao social e o CNPJ exatos', () => {
    wrap();
    expect(
      screen.getByText(/67\.146\.802 CHRISTIAN BRYAN PEREIRA/)
    ).toBeInTheDocument();
    expect(screen.getByText(/CNPJ 67\.146\.802\/0001-85/)).toBeInTheDocument();
  });

  it('tem as tres paginas legais exigidas pela verificacao da Meta', () => {
    wrap();
    expect(screen.getByRole('link', { name: 'Termos de Uso' }))
      .toHaveAttribute('href', '/termos');
    expect(screen.getByRole('link', { name: 'Política de Privacidade' }))
      .toHaveAttribute('href', '/privacidade');
    expect(screen.getByRole('link', { name: 'Exclusão de Dados' }))
      .toHaveAttribute('href', '/exclusao-de-dados');
  });

  it('nao contem prova social inventada', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/\d+\s*\+?\s*restaurantes/i);
    expect(texto).not.toMatch(/mais de \d/i);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- Footer
```

Esperado: FALHA com `Failed to resolve import "./Footer"`.

- [ ] **Step 3: Implementar Footer**

Crie `frontend/src/components/layout/Footer.tsx`:

```tsx
import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import Logo from '../brand/Logo';

const GRUPOS = [
  {
    titulo: 'Produto',
    links: [
      { rotulo: 'Recursos', href: '/#recursos' },
      { rotulo: 'Preço', href: '/#preco' },
      { rotulo: 'Perguntas', href: '/#perguntas' },
    ],
  },
  {
    titulo: 'Empresa',
    links: [{ rotulo: 'Sobre', href: '/sobre' }],
  },
  {
    titulo: 'Legal',
    links: [
      { rotulo: 'Termos de Uso', href: '/termos' },
      { rotulo: 'Política de Privacidade', href: '/privacidade' },
      { rotulo: 'Exclusão de Dados', href: '/exclusao-de-dados' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-50 py-14">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo variant="full" className="h-9 w-auto" />
            <p className="mt-4 max-w-xs text-sm text-ink-600">
              Atendimento por inteligência artificial no WhatsApp para delivery.
            </p>
          </div>

          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                {grupo.titulo}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {grupo.links.map((link) => (
                  <li key={link.rotulo}>
                    <Link
                      to={link.href}
                      className="text-sm text-ink-600 hover:text-brand-700"
                    >
                      {link.rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-stone-200 pt-6 text-xs leading-relaxed text-stone-500">
          <p>67.146.802 CHRISTIAN BRYAN PEREIRA</p>
          <p>CNPJ 67.146.802/0001-85 — Ribeirão Preto/SP</p>
          <p className="mt-2">
            © {new Date().getFullYear()} AtendIA. Todos os direitos reservados.
          </p>
        </div>
      </Container>
    </footer>
  );
}
```

- [ ] **Step 4: Implementar Header e SiteLayout**

Crie `frontend/src/components/layout/Header.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import Button from '../ui/Button';
import Logo from '../brand/Logo';

const NAV = [
  { rotulo: 'Como funciona', href: '/#como-funciona' },
  { rotulo: 'Recursos', href: '/#recursos' },
  { rotulo: 'Preço', href: '/#preco' },
  { rotulo: 'Perguntas', href: '/#perguntas' },
];

export default function Header() {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" aria-label="AtendIA — página inicial">
          <Logo variant="full" className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.rotulo}
              to={item.href}
              className="text-sm font-medium text-ink-600 hover:text-brand-700"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link to="/login" className="text-sm font-medium text-ink-600 hover:text-brand-700">
            Entrar
          </Link>
          <Button to="/cadastro" className="px-5 py-2.5 text-sm">
            Começar agora
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          aria-label="Abrir menu"
          className="lg:hidden rounded-lg p-2 text-ink-800 hover:bg-stone-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {aberto ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
          </svg>
        </button>
      </Container>

      {aberto && (
        <div className="border-t border-stone-200 bg-white lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <Link
                key={item.rotulo}
                to={item.href}
                onClick={() => setAberto(false)}
                className="rounded-lg px-2 py-2.5 text-sm font-medium text-ink-600 hover:bg-stone-50"
              >
                {item.rotulo}
              </Link>
            ))}
            <Link
              to="/login"
              onClick={() => setAberto(false)}
              className="rounded-lg px-2 py-2.5 text-sm font-medium text-ink-600 hover:bg-stone-50"
            >
              Entrar
            </Link>
            <Button to="/cadastro" className="mt-2">Começar agora</Button>
          </Container>
        </div>
      )}
    </header>
  );
}
```

Crie `frontend/src/components/layout/SiteLayout.tsx`:

```tsx
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
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npm test -- Footer
```

Esperado: PASSA — 3 testes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/
git commit -m "feat(frontend): Adiciona Header, Footer e SiteLayout

O Footer carrega a razao social e o CNPJ do MEI, e os links para as tres
paginas legais exigidas pela verificacao de aplicativo da Meta — termos,
privacidade e exclusao de dados.

Um dos testes verifica ausencia de prova social: o produto nao tem
clientes ainda, e a spec proibe qualquer contador ou metrica inventada."
```

---

## Task 5: Roteamento com code splitting

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/site/Cadastro.tsx`
- Create: `frontend/src/pages/site/Sobre.tsx`
- Create: `frontend/src/pages/site/NaoEncontrado.tsx`
- Move: `frontend/src/pages/{Login,Dashboard,Crm,Ifood}.tsx` → `frontend/src/pages/app/`
- Delete: `frontend/src/App.css`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `SiteLayout` (Task 4), `Button` (Task 3)
- Produces: rotas `/`, `/sobre`, `/cadastro`, `/termos`, `/privacidade`, `/exclusao-de-dados`, `/login`, `/app/*`

**Nota:** as páginas atuais do painel são movidas, não reescritas. Elas serão refeitas no ciclo 3; movê-las mantém o app compilando e preserva o trabalho existente.

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/src/App.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

const renderEm = (rota: string) =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <App />
    </MemoryRouter>
  );

describe('Roteamento', () => {
  it('a raiz mostra a landing', async () => {
    renderEm('/');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('/cadastro mostra o placeholder, sem prometer o que nao existe', async () => {
    renderEm('/cadastro');
    expect(await screen.findByText(/finalizando os últimos ajustes/i)).toBeInTheDocument();
  });

  it('/sobre existe', async () => {
    renderEm('/sobre');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('rota inexistente mostra pagina 404', async () => {
    renderEm('/rota-que-nao-existe');
    expect(await screen.findByText(/página não encontrada/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- App
```

Esperado: FALHA — a landing e as páginas ainda não existem.

- [ ] **Step 3: Mover as páginas do painel**

```bash
cd frontend
mkdir -p src/pages/app src/pages/site
git mv src/pages/Login.tsx src/pages/app/Login.tsx
git mv src/pages/Dashboard.tsx src/pages/app/Dashboard.tsx
git mv src/pages/Crm.tsx src/pages/app/Crm.tsx
git mv src/pages/Ifood.tsx src/pages/app/Ifood.tsx
git rm src/App.css
```

Corrija os imports relativos dentro de cada arquivo movido: `../services/api` vira `../../services/api`, e `../components/...` vira `../../components/...`.

- [ ] **Step 4: Criar as páginas simples**

Crie `frontend/src/pages/site/Cadastro.tsx`:

```tsx
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
```

Crie `frontend/src/pages/site/Sobre.tsx`:

```tsx
import Container from '../../components/ui/Container';

export default function Sobre() {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Sobre o AtendIA
        </h1>
        <div className="mt-8 space-y-5 text-ink-600 leading-relaxed">
          <p>
            O AtendIA nasceu de uma observação simples: em todo delivery, alguém
            passa o dia inteiro digitando as mesmas respostas no WhatsApp.
            Anotando pedido, informando preço, calculando troco. Enquanto isso, o
            cliente que mandou mensagem há dez minutos já pediu em outro lugar.
          </p>
          <p>
            A proposta é tirar esse trabalho repetitivo do caminho. A
            inteligência artificial atende, entende texto e áudio, monta o pedido
            com os preços reais do cardápio e entrega tudo pronto no painel da
            cozinha. O time do restaurante volta a fazer o que só ele sabe:
            cozinhar bem e cuidar do cliente.
          </p>
          <p>
            Somos uma empresa brasileira, pequena e independente, feita para
            restaurantes brasileiros. Quem responde o suporte é quem escreve o
            código.
          </p>
        </div>

        <div className="mt-12 rounded-lg border border-stone-200 bg-stone-50 p-6 text-sm text-ink-600">
          <h2 className="font-semibold text-ink-800">Dados da empresa</h2>
          <p className="mt-3">67.146.802 CHRISTIAN BRYAN PEREIRA</p>
          <p>CNPJ 67.146.802/0001-85</p>
          <p>Ribeirão Preto — São Paulo</p>
          <p className="mt-3">
            <a href="mailto:christianpereira.mtx@gmail.com" className="font-medium text-brand-700">
              christianpereira.mtx@gmail.com
            </a>
          </p>
        </div>
      </div>
    </Container>
  );
}
```

Crie `frontend/src/pages/site/NaoEncontrado.tsx`:

```tsx
import Container from '../../components/ui/Container';
import Button from '../../components/ui/Button';

export default function NaoEncontrado() {
  return (
    <Container className="py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">
        Erro 404
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-800">
        Página não encontrada
      </h1>
      <p className="mt-4 text-ink-600">
        O endereço que você tentou acessar não existe ou foi movido.
      </p>
      <Button to="/" className="mt-8">Voltar ao início</Button>
    </Container>
  );
}
```

- [ ] **Step 5: Criar uma landing mínima (preenchida nos Tasks 7-9)**

Crie `frontend/src/pages/site/Landing.tsx`:

```tsx
export default function Landing() {
  return (
    <h1 className="sr-only">AtendIA</h1>
  );
}
```

- [ ] **Step 6: Reescrever o App com code splitting**

Substitua `frontend/src/App.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import SiteLayout from './components/layout/SiteLayout';
import Landing from './pages/site/Landing';
import Sobre from './pages/site/Sobre';
import Cadastro from './pages/site/Cadastro';
import NaoEncontrado from './pages/site/NaoEncontrado';
import ProtectedRoute from './components/ProtectedRoute';

// O painel so e baixado quando o usuario entra nele. Sem isso, um
// visitante da landing carregaria o bundle inteiro para ver a home.
const Login = lazy(() => import('./pages/app/Login'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Crm = lazy(() => import('./pages/app/Crm'));
const Ifood = lazy(() => import('./pages/app/Ifood'));

const Carregando = () => (
  <div className="py-24 text-center text-sm text-ink-600">Carregando…</div>
);

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        {/* Site publico: herda Header e Footer via SiteLayout */}
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/sobre" element={<Sobre />} />
          <Route path="/cadastro" element={<Cadastro />} />
          {/* As tres rotas legais entram no Task 6, junto com o LegalPage */}
          <Route path="*" element={<NaoEncontrado />} />
        </Route>

        {/* Painel: fora do layout do site, tera navegacao propria no ciclo 3 */}
        <Route path="/login" element={<Login />} />
        <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/app/crm" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
        <Route path="/app/ifood" element={<ProtectedRoute><Ifood /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  );
}
```

⚠️ **Não importe `LegalPage` aqui.** Ele só é criado no Task 6 — importá-lo agora quebraria o app inteiro, não apenas as rotas legais.

Ajuste `frontend/src/main.tsx` para envolver o App no `BrowserRouter` (ele saiu do App para que os testes possam usar `MemoryRouter`):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 7: Rodar os testes**

```bash
npm test
```

Esperado: os 4 testes de roteamento passam. A landing ainda é só um `h1` invisível — os Tasks 7-9 a preenchem.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "feat(frontend): Reorganiza rotas com code splitting na fronteira do painel

Separa pages/site de pages/app. O painel entra por React.lazy: sem isso,
um visitante da landing baixaria o bundle inteiro do app so para ver a
home. As paginas atuais do painel foram movidas, nao reescritas — serao
refeitas no ciclo 3, e move-las mantem o app compilando.

BrowserRouter sai do App para o main, permitindo que os testes montem as
rotas com MemoryRouter.

Remove App.css, resquicio do template do Vite."
```

---

## Task 6: Páginas legais a partir de markdown

**Files:**
- Create: `frontend/src/content/legal/termos.md`
- Create: `frontend/src/content/legal/privacidade.md`
- Create: `frontend/src/content/legal/exclusao-de-dados.md`
- Create: `frontend/src/components/ui/Prose.tsx`
- Create: `frontend/src/pages/site/LegalPage.tsx`
- Test: `frontend/src/pages/site/LegalPage.test.tsx`

**Interfaces:**
- Consumes: `Container` (Task 3)
- Produces: `<LegalPage documento="termos" | "privacidade" | "exclusao-de-dados" />`

- [ ] **Step 1: Instalar o renderizador de markdown**

```bash
cd frontend
npm install react-markdown remark-gfm
```

`remark-gfm` é necessário porque os documentos usam tabelas.

- [ ] **Step 2: Escrever o teste que falha**

Crie `frontend/src/pages/site/LegalPage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LegalPage from './LegalPage';

const wrap = (doc: 'termos' | 'privacidade' | 'exclusao-de-dados') =>
  render(<MemoryRouter><LegalPage documento={doc} /></MemoryRouter>);

describe('LegalPage', () => {
  it('renderiza os Termos de Uso', () => {
    wrap('termos');
    expect(screen.getByRole('heading', { level: 1, name: /Termos de Uso/i }))
      .toBeInTheDocument();
  });

  it('renderiza a Politica de Privacidade com o CNPJ', () => {
    const { container } = wrap('privacidade');
    expect(container.textContent).toContain('67.146.802/0001-85');
  });

  it('renderiza as Instrucoes de Exclusao de Dados', () => {
    wrap('exclusao-de-dados');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('NAO vaza o aviso interno de minuta para o publico', () => {
    for (const doc of ['termos', 'privacidade', 'exclusao-de-dados'] as const) {
      const { container, unmount } = wrap(doc);
      expect(container.textContent).not.toContain('MINUTA');
      expect(container.textContent).not.toContain('não validada juridicamente');
      unmount();
    }
  });

  it('nao instrui a usar o botao de exclusao que ainda nao existe', () => {
    const { container } = wrap('exclusao-de-dados');
    expect(container.textContent).not.toContain('Configurações → Conta');
  });
});
```

Os dois últimos testes são guardas contra erros concretos: o aviso de minuta é nota interna que destruiria a credibilidade do documento se publicada (e confundiria o revisor da Meta), e a Opção A descreve um botão do painel que só existirá no ciclo 3.

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npm test -- LegalPage
```

Esperado: FALHA com `Failed to resolve import "./LegalPage"`.

- [ ] **Step 4: Copiar os documentos, removendo o que não pode ser publicado**

Copie os três arquivos de `docs/legal/` para `frontend/src/content/legal/`, aplicando estas remoções:

1. **Nos três:** apagar o bloco de citação que começa com `> ⚠️ **MINUTA` e vai até o fim daquele parágrafo.
2. **Em `exclusao-de-dados.md`:** apagar toda a seção `## Opção A — Pelo painel` (incluindo o comentário HTML) e renomear `## Opção B — Por e-mail` para `## Como pedir`. Ajustar a frase anterior que dizia "Siga a **Opção A** ou a **Opção B** abaixo" para "Siga as instruções abaixo", e a que dizia "**Pedir a nós** pelo e-mail abaixo" mantém-se.
3. **Nos três:** apagar os comentários HTML `<!-- ... -->`.

A partir daqui, `frontend/src/content/legal/` é a **fonte única** do texto publicado. Os arquivos em `docs/legal/` permanecem como registro anotado da minuta.

- [ ] **Step 5: Habilitar import de markdown como texto**

Adicione ao `frontend/vite.config.ts`, dentro de `defineConfig`:

```ts
  assetsInclude: ['**/*.md'],
```

Crie `frontend/src/content/legal/legal.d.ts`:

```ts
declare module '*.md?raw' {
  const content: string;
  export default content;
}
```

- [ ] **Step 6: Implementar Prose e LegalPage**

Crie `frontend/src/components/ui/Prose.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-600">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="!mt-10 border-t border-stone-200 pt-8 text-xl font-semibold text-ink-800">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="!mt-6 text-base font-semibold text-ink-800">{children}</h3>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-ink-800">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} className="font-medium text-brand-700 underline underline-offset-2">{children}</a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="rounded-lg border-l-4 border-brand-500 bg-brand-50 px-4 py-3">{children}</blockquote>
          ),
          hr: () => <hr className="!my-10 border-stone-200" />,
          // Tabelas precisam rolar sozinhas: o corpo da pagina nunca
          // deve rolar na horizontal no celular.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-stone-200 bg-stone-50 px-3 py-2 text-left font-semibold text-ink-800">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-stone-200 px-3 py-2 align-top">{children}</td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
```

Crie `frontend/src/pages/site/LegalPage.tsx`:

```tsx
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
```

- [ ] **Step 7: Registrar as três rotas legais**

Agora que `LegalPage` existe, adicione ao `frontend/src/App.tsx` — o import no topo:

```tsx
import LegalPage from './pages/site/LegalPage';
```

E as três rotas dentro do bloco `<Route element={<SiteLayout />}>`, antes da rota `path="*"`:

```tsx
          <Route path="/termos" element={<LegalPage documento="termos" />} />
          <Route path="/privacidade" element={<LegalPage documento="privacidade" />} />
          <Route path="/exclusao-de-dados" element={<LegalPage documento="exclusao-de-dados" />} />
```

A ordem importa: `path="*"` precisa continuar sendo a última rota do bloco, senão ela captura tudo.

- [ ] **Step 8: Escrever o teste de integração das rotas legais**

Acrescente a `frontend/src/App.test.tsx`, dentro do `describe('Roteamento')`:

```tsx
  it.each(['/termos', '/privacidade', '/exclusao-de-dados'])(
    '%s abre a pagina legal correspondente',
    async (rota) => {
      renderEm(rota);
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    }
  );
```

- [ ] **Step 9: Rodar e confirmar que passa**

```bash
npm test
```

Esperado: PASSA — 5 testes do `LegalPage` e 7 do roteamento.

- [ ] **Step 10: Conferir no navegador**

```bash
npm run dev
```

Abra `/termos`, `/privacidade` e `/exclusao-de-dados`. Confirme que as tabelas rolam sozinhas no celular (reduza a janela) e que nenhum aviso de minuta aparece.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/content/ frontend/src/components/ui/Prose.tsx frontend/src/pages/site/LegalPage.tsx frontend/src/App.tsx frontend/src/App.test.tsx frontend/vite.config.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): Publica as tres paginas legais a partir de markdown

O texto fica em markdown em src/content/legal, renderizado por
react-markdown. Manter markdown como fonte evita transformar documento
juridico em JSX, onde qualquer edicao futura vira risco de quebrar a
formatacao.

Dois testes atuam como guarda: um garante que o aviso interno de minuta
nunca chegue ao publico — vazar isso destruiria a credibilidade do
documento e confundiria a revisao da Meta — e outro garante que a pagina
de exclusao nao instrua a clicar num botao do painel que so existira no
ciclo 3."
```

---

## Task 7: Landing — Hero e Problema

**Files:**
- Create: `frontend/src/pages/site/sections/Hero.tsx`
- Create: `frontend/src/pages/site/sections/ConversaDemo.tsx`
- Create: `frontend/src/pages/site/sections/Problema.tsx`
- Modify: `frontend/src/pages/site/Landing.tsx`
- Test: `frontend/src/pages/site/sections/Hero.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Section`, `Container` (Task 3)
- Produces: `<Hero />`, `<Problema />`, `<ConversaDemo />`

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/src/pages/site/sections/Hero.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Hero from './Hero';

const wrap = () => render(<MemoryRouter><Hero /></MemoryRouter>);

describe('Hero', () => {
  it('tem exatamente um h1', () => {
    wrap();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('o CTA principal leva ao cadastro', () => {
    wrap();
    expect(screen.getByRole('link', { name: 'Começar agora' }))
      .toHaveAttribute('href', '/cadastro');
  });

  it('usa o texto exato da oferta, sem chamar de gratis', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).toContain('Teste sem risco por 7 dias');
    expect(texto).not.toMatch(/gr[áa]tis/i);
  });

  it('nao contem prova social inventada', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/\+?\s*\d{3,}\s*(restaurantes|clientes|pedidos processados)/i);
    expect(texto).not.toMatch(/mais de \d/i);
  });
});
```

O teste `não chamar de grátis` trava a decisão jurídica: a cobrança acontece na entrada, e anunciar como grátis seria publicidade enganosa.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- Hero
```

Esperado: FALHA com `Failed to resolve import "./Hero"`.

- [ ] **Step 3: Implementar a demonstração de conversa**

Crie `frontend/src/pages/site/sections/ConversaDemo.tsx`:

```tsx
type Mensagem = {
  de: 'cliente' | 'ia';
  texto: string;
  audio?: boolean;
};

const CONVERSA: Mensagem[] = [
  { de: 'cliente', texto: 'Áudio · 0:08', audio: true },
  { de: 'ia', texto: 'Oi, Marina! Duas pizzas grandes de calabresa, é isso? Fica R$ 90,00.' },
  { de: 'ia', texto: 'Entrego no endereço de sempre, Rua das Acácias 220? A taxa é R$ 6,00.' },
  { de: 'cliente', texto: 'isso mesmo, vou pagar em dinheiro, tenho 100' },
  { de: 'ia', texto: 'Fechado! Total R$ 96,00, levo R$ 4,00 de troco. Sai em ~35 min. 🍕' },
];

export default function ConversaDemo() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2.5 border-b border-stone-200 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
          P
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-800">Pizzaria do Bairro</p>
          <p className="text-xs text-brand-700">respondendo agora</p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {CONVERSA.map((msg, i) => (
          <li
            key={i}
            className={msg.de === 'cliente' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={[
                'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.de === 'cliente'
                  ? 'rounded-br-sm bg-brand-500 text-white'
                  : 'rounded-bl-sm border border-stone-200 bg-white text-ink-800',
              ].join(' ')}
            >
              {msg.audio ? (
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                  </svg>
                  {msg.texto}
                </span>
              ) : (
                msg.texto
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-stone-200 pt-3 text-center text-xs text-stone-500">
        Exemplo ilustrativo de atendimento
      </p>
    </div>
  );
}
```

> A linha "Exemplo ilustrativo" é obrigatória: sem ela, a conversa poderia ser lida como registro real de um cliente.

- [ ] **Step 4: Implementar Hero e Problema**

Crie `frontend/src/pages/site/sections/Hero.tsx`:

```tsx
import Container from '../../../components/ui/Container';
import Button from '../../../components/ui/Button';
import ConversaDemo from './ConversaDemo';

export default function Hero() {
  return (
    <div className="border-b border-stone-200 bg-white py-16 sm:py-24">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-ink-800 sm:text-5xl">
              Seu WhatsApp vendendo sozinho, 24 horas por dia
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-600">
              A IA atende por texto e por áudio, monta o pedido, calcula a
              entrega e o troco — e joga tudo direto no seu PDV. Sem contratar
              mais ninguém.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/cadastro">Começar agora</Button>
              <Button href="#demonstracao" variant="secondary">Ver como funciona</Button>
            </div>
            <p className="mt-5 text-sm text-ink-600">
              Teste sem risco por 7 dias · Cancele quando quiser
            </p>
          </div>

          <ConversaDemo />
        </div>
      </Container>
    </div>
  );
}
```

Crie `frontend/src/pages/site/sections/Problema.tsx`:

```tsx
import Section from '../../../components/ui/Section';

const HOJE = [
  'O pedido chega no pico e ninguém tem mão livre para responder',
  'O cliente espera dez minutos, desiste e pede no concorrente',
  'A comanda é anotada no papel e sai errada da cozinha',
  'Fora do horário comercial, o WhatsApp simplesmente não responde',
];

const COM_ATENDIA = [
  'Toda mensagem é respondida na hora, inclusive as de áudio',
  'O cliente fecha o pedido sem esperar por ninguém',
  'O pedido chega no painel já formatado, com preço e endereço',
  'Madrugada, domingo e feriado: o atendimento continua de pé',
];

export default function Problema() {
  return (
    <Section tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Todo delivery perde venda no mesmo lugar
        </h2>
        <p className="mt-4 text-ink-600">
          Não é falta de cliente. É falta de alguém livre para responder.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-400">
            Como é hoje
          </h3>
          <ul className="mt-5 space-y-3.5">
            {HOJE.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink-600">
                <span aria-hidden="true" className="mt-0.5 font-bold text-stone-400">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-brand-500 bg-white p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-700">
            Com o AtendIA
          </h3>
          <ul className="mt-5 space-y-3.5">
            {COM_ATENDIA.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink-600">
                <span aria-hidden="true" className="mt-0.5 font-bold text-brand-700">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Montar na Landing**

Substitua `frontend/src/pages/site/Landing.tsx`:

```tsx
import Hero from './sections/Hero';
import Problema from './sections/Problema';

export default function Landing() {
  return (
    <>
      <Hero />
      <Problema />
    </>
  );
}
```

- [ ] **Step 6: Rodar os testes**

```bash
npm test
```

Esperado: `Hero` passa (4 testes) e o teste de roteamento da landing passa.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/site/
git commit -m "feat(frontend): Adiciona Hero e secao de problema da landing

O teste do Hero trava duas decisoes que sao dificeis de recuperar se
quebrarem: a oferta nao pode usar a palavra 'gratis', porque a cobranca
acontece na entrada e isso configuraria publicidade enganosa; e nenhuma
metrica de prova social pode aparecer, porque o produto ainda nao tem
clientes.

A conversa de demonstracao traz rotulo 'Exemplo ilustrativo' — sem ele,
poderia ser lida como registro real de um cliente."
```

---

## Task 8: Landing — Como funciona, Recursos e Demonstração

**Files:**
- Create: `frontend/src/pages/site/sections/ComoFunciona.tsx`
- Create: `frontend/src/pages/site/sections/Recursos.tsx`
- Create: `frontend/src/pages/site/sections/Demonstracao.tsx`
- Modify: `frontend/src/pages/site/Landing.tsx`
- Test: `frontend/src/pages/site/sections/Recursos.test.tsx`

**Interfaces:**
- Consumes: `Section` (Task 3), `ConversaDemo` (Task 7)
- Produces: `<ComoFunciona />`, `<Recursos />`, `<Demonstracao />`

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/src/pages/site/sections/Recursos.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Recursos from './Recursos';

describe('Recursos', () => {
  it('destaca o atendimento por audio, que e o diferencial', () => {
    const { container } = render(<Recursos />);
    const destaques = screen.getAllByRole('heading', { level: 3 });
    const textoDosDestaques = destaques.map((h) => h.textContent).join(' ');
    expect(textoDosDestaques.toLowerCase()).toContain('áudio');
    expect(container.textContent).toContain('responde em áudio');
  });

  it('tem a ancora usada pelo menu', () => {
    const { container } = render(<Recursos />);
    expect(container.querySelector('#recursos')).toBeInTheDocument();
  });

  it('nao promete recurso ainda inexistente sem ressalva', () => {
    const { container } = render(<Recursos />);
    // O envio de cardapio em PDF so existira no ciclo 3/4.
    expect(container.textContent).not.toContain('PDF');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- Recursos
```

Esperado: FALHA com `Failed to resolve import "./Recursos"`.

- [ ] **Step 3: Implementar ComoFunciona**

Crie `frontend/src/pages/site/sections/ComoFunciona.tsx`:

```tsx
import Section from '../../../components/ui/Section';

const PASSOS = [
  {
    numero: '1',
    titulo: 'Conecte seu WhatsApp',
    texto: 'Use o mesmo número que seus clientes já conhecem. Não precisa trocar de linha.',
  },
  {
    numero: '2',
    titulo: 'Suba seu cardápio',
    texto: 'Cadastre os produtos no painel ou importe direto do seu iFood.',
  },
  {
    numero: '3',
    titulo: 'A IA atende e vende',
    texto: 'Ela responde texto e áudio, tira dúvidas, calcula entrega e fecha o pedido.',
  },
  {
    numero: '4',
    titulo: 'O pedido cai no painel',
    texto: 'Já formatado, com itens, endereço e forma de pagamento. É só produzir.',
  },
];

export default function ComoFunciona() {
  return (
    <Section id="como-funciona">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Do "oi" ao pedido na cozinha
        </h2>
        <p className="mt-4 text-ink-600">
          Quatro passos para configurar. Depois, funciona sozinho.
        </p>
      </div>

      <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {PASSOS.map((passo) => (
          <li key={passo.numero}>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-lg font-bold text-brand-700">
              {passo.numero}
            </div>
            <h3 className="mt-4 font-semibold text-ink-800">{passo.titulo}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{passo.texto}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
```

- [ ] **Step 4: Implementar Recursos**

Crie `frontend/src/pages/site/sections/Recursos.tsx`:

```tsx
import Section from '../../../components/ui/Section';

const DESTAQUES = [
  {
    titulo: 'Entende e responde em áudio',
    texto:
      'Seu cliente manda áudio porque é mais rápido que digitar. A IA ouve, entende e responde em áudio também — com voz natural, não robotizada. É o que mais diferencia o atendimento.',
  },
  {
    titulo: 'PDV e cozinha em tempo real',
    texto:
      'Os pedidos aparecem no painel conforme chegam e caminham pelos status até a entrega. Controle de caixa incluído, com abertura e fechamento.',
  },
  {
    titulo: 'CRM que traz o cliente de volta',
    texto:
      'Cada cliente tem histórico, total gasto e pontos de fidelidade. Quem parou de pedir entra em campanha automática de reativação com cupom.',
  },
];

const SECUNDARIOS = [
  'Importação de cardápio do iFood',
  'Pagamento por PIX',
  'Cálculo automático de taxa de entrega',
  'Cálculo de troco',
  'Cardápio digital com fotos',
  'Complementos e adicionais',
  'Controle de disponibilidade por produto',
  'Múltiplos usuários no painel',
  'Histórico completo de pedidos',
  'Tom de voz da IA configurável',
  'Instruções personalizadas por loja',
  'Repetição de pedido em um clique',
];

export default function Recursos() {
  return (
    <Section id="recursos" tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Tudo que o delivery precisa, num lugar só
        </h2>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {DESTAQUES.map((item) => (
          <div key={item.titulo} className="rounded-lg border border-stone-200 bg-white p-7">
            <h3 className="text-lg font-semibold text-ink-800">{item.titulo}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{item.texto}</p>
          </div>
        ))}
      </div>

      <ul className="mt-8 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECUNDARIOS.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] text-ink-600">
            <span aria-hidden="true" className="font-bold text-brand-700">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 5: Implementar Demonstração**

Crie `frontend/src/pages/site/sections/Demonstracao.tsx`:

```tsx
import Section from '../../../components/ui/Section';
import ConversaDemo from './ConversaDemo';

const PEDIDO = {
  numero: '#1042',
  cliente: 'Marina S.',
  itens: [{ qtd: 2, nome: 'Pizza Grande Calabresa', valor: 'R$ 90,00' }],
  taxa: 'R$ 6,00',
  total: 'R$ 96,00',
  pagamento: 'Dinheiro — troco para R$ 100,00',
};

export default function Demonstracao() {
  return (
    <Section id="demonstracao">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          O cliente conversa. Você recebe o pedido pronto.
        </h2>
        <p className="mt-4 text-ink-600">
          Enquanto a conversa acontece no WhatsApp, o pedido se monta sozinho no
          seu painel.
        </p>
      </div>

      <div className="mt-14 grid items-start gap-8 lg:grid-cols-2">
        <ConversaDemo />

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <p className="font-semibold text-ink-800">Pedido {PEDIDO.numero}</p>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand-700">
              Novo
            </span>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-600">Cliente</dt>
              <dd className="font-medium text-ink-800">{PEDIDO.cliente}</dd>
            </div>
            {PEDIDO.itens.map((item) => (
              <div key={item.nome} className="flex justify-between">
                <dt className="text-ink-600">{item.qtd}× {item.nome}</dt>
                <dd className="font-medium text-ink-800">{item.valor}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-ink-600">Taxa de entrega</dt>
              <dd className="font-medium text-ink-800">{PEDIDO.taxa}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-3">
              <dt className="font-semibold text-ink-800">Total</dt>
              <dd className="font-bold text-ink-800">{PEDIDO.total}</dd>
            </div>
            <div className="rounded-lg bg-stone-50 px-3 py-2.5 text-xs text-ink-600">
              {PEDIDO.pagamento}
            </div>
          </dl>

          <p className="mt-4 border-t border-stone-200 pt-3 text-center text-xs text-stone-500">
            Exemplo ilustrativo do painel
          </p>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 6: Atualizar a Landing**

Substitua `frontend/src/pages/site/Landing.tsx`:

```tsx
import Hero from './sections/Hero';
import Problema from './sections/Problema';
import ComoFunciona from './sections/ComoFunciona';
import Recursos from './sections/Recursos';
import Demonstracao from './sections/Demonstracao';

export default function Landing() {
  return (
    <>
      <Hero />
      <Problema />
      <ComoFunciona />
      <Recursos />
      <Demonstracao />
    </>
  );
}
```

- [ ] **Step 7: Rodar os testes**

```bash
npm test
```

Esperado: todos passam.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/site/
git commit -m "feat(frontend): Adiciona como funciona, recursos e demonstracao

A secao de recursos da destaque proprio ao atendimento por audio, que e
o que mais diferencia o produto — cliente de delivery manda audio o tempo
todo, e enterrar isso numa lista desperdicaria o diferencial.

Um teste impede que o envio de cardapio em PDF seja anunciado: esse
recurso so existira no ciclo 3/4, e a spec proibe prometer o que ainda
nao funciona.

A demonstracao mostra a conversa e o pedido montado lado a lado, ambos
rotulados como exemplo ilustrativo."
```

---

## Task 9: Landing — Preço, FAQ e chamada final

**Files:**
- Create: `frontend/src/pages/site/sections/Preco.tsx`
- Create: `frontend/src/pages/site/sections/Faq.tsx`
- Create: `frontend/src/pages/site/sections/CtaFinal.tsx`
- Modify: `frontend/src/pages/site/Landing.tsx`
- Test: `frontend/src/pages/site/sections/Preco.test.tsx`

**Interfaces:**
- Consumes: `Section`, `Button`, `Container` (Task 3)
- Produces: `<Preco />`, `<Faq />`, `<CtaFinal />`

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/src/pages/site/sections/Preco.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Preco from './Preco';

const wrap = () => render(<MemoryRouter><Preco /></MemoryRouter>);

describe('Preco', () => {
  it('mostra o preco exato', () => {
    const { container } = wrap();
    expect(container.textContent).toContain('R$ 179,99');
  });

  it('mostra a oferta com o texto exato da spec', () => {
    const { container } = wrap();
    expect(container.textContent).toContain(
      'Teste sem risco por 7 dias'
    );
    expect(container.textContent).toContain('devolvemos 100% do valor');
  });

  it('mostra as duas cotas com os numeros contratuais', () => {
    const { container } = wrap();
    expect(container.textContent).toContain('10.000 créditos');
    expect(container.textContent).toContain('100 disparos');
  });

  it('a estimativa de pedidos aparece com "aprox." e com a ressalva obrigatoria', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).toContain('≈300 pedidos');
    // Sem a ressalva, "300 pedidos" vira promessa que o sistema nao controla.
    expect(texto).toMatch(/estimativa/i);
    expect(texto).toMatch(/áudio/i);
  });

  it('o CTA leva ao cadastro', () => {
    wrap();
    expect(screen.getByRole('link', { name: 'Começar agora' }))
      .toHaveAttribute('href', '/cadastro');
  });

  it('nao usa urgencia falsa', () => {
    const { container } = wrap();
    const texto = container.textContent ?? '';
    expect(texto).not.toMatch(/só hoje|últimas vagas|oferta expira|restam \d/i);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npm test -- Preco
```

Esperado: FALHA com `Failed to resolve import "./Preco"`.

- [ ] **Step 3: Implementar Preço**

Crie `frontend/src/pages/site/sections/Preco.tsx`:

```tsx
import Section from '../../../components/ui/Section';
import Button from '../../../components/ui/Button';

const INCLUSO = [
  'IA que atende por texto e áudio, 24 horas',
  'PDV e painel de cozinha em tempo real',
  'Cardápio digital + importação do iFood',
  'CRM com fidelidade e reativação',
  'Pedidos e usuários ilimitados',
];

export default function Preco() {
  return (
    <Section id="preco" tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Um plano, sem pegadinha
        </h2>
        <p className="mt-4 text-ink-600">
          Tudo incluído. Sem taxa de instalação, sem fidelidade.
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 p-7 text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700">
            Plano único
          </span>
          <p className="mt-4 text-5xl font-bold tracking-tight text-ink-800">
            R$ 179,99
            <span className="text-base font-medium text-ink-600"> /mês</span>
          </p>

          <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4 text-left">
            <p className="font-semibold text-brand-700">
              ✓ Teste sem risco por 7 dias
            </p>
            <p className="mt-1 text-sm text-ink-600">
              Não gostou? Devolvemos 100% do valor, sem burocracia.
            </p>
          </div>

          <Button to="/cadastro" className="mt-5 w-full">Começar agora</Button>
        </div>

        <div className="p-7">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Está tudo incluso
          </h3>
          <ul className="mt-4 space-y-2.5">
            {INCLUSO.map((item) => (
              <li key={item} className="flex gap-2.5 text-[15px] text-ink-600">
                <span aria-hidden="true" className="font-bold text-brand-700">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-stone-100 bg-white p-7">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
            Sua cota mensal
          </h3>

          <div className="mt-4 space-y-5">
            <div>
              <p className="font-semibold text-ink-800">Atende ≈300 pedidos por mês</p>
              <p className="mt-1 text-sm text-ink-600">
                10.000 créditos de atendimento. Uma resposta em texto usa 1
                crédito; em áudio, 8.
              </p>
            </div>

            <div>
              <p className="font-semibold text-ink-800">100 disparos de campanha</p>
              <p className="mt-1 text-sm text-ink-600">
                Para reativar clientes que pararam de pedir.
              </p>
            </div>
          </div>

          <p className="mt-6 border-t border-dashed border-stone-200 pt-4 text-xs leading-relaxed text-stone-500">
            Precisou de mais? Pacotes avulsos ficam disponíveis dentro do painel.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            Os ≈300 pedidos são uma estimativa de uso médio: o consumo varia
            conforme quanto do seu atendimento for por áudio. O limite contratual
            são os 10.000 créditos.
          </p>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Implementar FAQ**

Crie `frontend/src/pages/site/sections/Faq.tsx`:

```tsx
import Section from '../../../components/ui/Section';

const PERGUNTAS = [
  {
    q: 'Preciso trocar o número que já uso?',
    a: 'Não. O AtendIA funciona com o número que seus clientes já conhecem, conectado pela API oficial do WhatsApp Business.',
  },
  {
    q: 'E se a IA errar um pedido?',
    a: 'Todo pedido aparece no seu painel antes de ir para a produção — você confere e corrige se precisar. A IA é uma ferramenta de atendimento, e a palavra final é sempre sua. Se preferir, dá para desligar o atendimento automático a qualquer momento e assumir a conversa.',
  },
  {
    q: 'Meu cardápio do iFood entra automático?',
    a: 'Sim, a importação traz categorias e produtos do seu iFood. Depois você pode editar tudo e acrescentar itens que só existem no seu delivery próprio.',
  },
  {
    q: 'E se meus créditos acabarem no meio do mês?',
    a: 'O atendimento automático fica suspenso até a renovação ou até você comprar um pacote avulso. O painel, o PDV e todo o resto continuam funcionando normalmente, e você recebe aviso antes de chegar no limite.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Pode, pelo painel ou por e-mail. Não há multa nem fidelidade. O cancelamento interrompe as próximas cobranças e você mantém o acesso até o fim do período já pago.',
  },
  {
    q: 'Meus dados e os dos meus clientes estão seguros?',
    a: 'Cada restaurante fica isolado no banco de dados, senhas são criptografadas e as credenciais de integração ficam cifradas. As mensagens do WhatsApp passam por verificação criptográfica. A Política de Privacidade detalha quais dados tratamos e com quais fornecedores eles são compartilhados.',
  },
];

export default function Faq() {
  return (
    <Section id="perguntas">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Perguntas frequentes
        </h2>

        <dl className="mt-12 divide-y divide-stone-200 border-y border-stone-200">
          {PERGUNTAS.map((item) => (
            <div key={item.q} className="py-6">
              <dt className="font-semibold text-ink-800">{item.q}</dt>
              <dd className="mt-2.5 text-[15px] leading-relaxed text-ink-600">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Implementar chamada final**

Crie `frontend/src/pages/site/sections/CtaFinal.tsx`:

```tsx
import Section from '../../../components/ui/Section';
import Button from '../../../components/ui/Button';

export default function CtaFinal() {
  return (
    <Section tone="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Seu delivery pode vender enquanto você cozinha
        </h2>
        <p className="mt-4 text-ink-600">
          Configure em uma tarde. Se não fizer sentido para você, devolvemos o
          valor em até 7 dias.
        </p>
        <div className="mt-8 flex justify-center">
          <Button to="/cadastro">Começar agora</Button>
        </div>
        <p className="mt-5 text-sm text-ink-600">
          Sem fidelidade · Cancele quando quiser
        </p>
      </div>
    </Section>
  );
}
```

- [ ] **Step 6: Montar a Landing completa**

Substitua `frontend/src/pages/site/Landing.tsx`:

```tsx
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
```

- [ ] **Step 7: Rodar tudo**

```bash
npm test && npm run build
```

Esperado: todos os testes passam e o build conclui.

- [ ] **Step 8: Conferir no navegador**

```bash
npm run dev
```

Percorra a página inteira em desktop e reduza a janela para largura de celular. Confirme: nenhuma rolagem horizontal, os links do menu rolam para as âncoras certas, o rodapé mostra o CNPJ, e as três páginas legais abrem.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/site/
git commit -m "feat(frontend): Adiciona preco, FAQ e chamada final — landing completa

O card de preco usa a linguagem do lojista no numero grande (pedidos) e
mantem o numero contratual visivel embaixo (creditos), com a ressalva
obrigatoria de que a estimativa varia conforme o uso de audio. Sem essa
ressalva, '300 pedidos' viraria promessa que o sistema nao controla.

O FAQ inclui o que acontece quando a cota acaba: os Termos preveem
suspensao do atendimento automatico, e o comprador precisa saber disso
antes de pagar, nao depois.

Testes travam o preco exato, o texto da oferta, as duas cotas e a
ausencia de urgencia falsa."
```

---

## Verificação Final

Antes de considerar a entrega pronta:

- [ ] `npm test` passa inteiro
- [ ] `npm run build` conclui sem erro
- [ ] `npx tsc --noEmit` não acusa erro novo no frontend
- [ ] Nenhuma rolagem horizontal em 375px de largura
- [ ] As seis rotas do site abrem: `/`, `/sobre`, `/cadastro`, `/termos`, `/privacidade`, `/exclusao-de-dados`
- [ ] `/rota-inexistente` mostra o 404
- [ ] Nenhum texto na página usa a palavra "grátis"
- [ ] Nenhum número de prova social aparece

**Pendências que NÃO são desta entrega** (registradas na spec, seção 3 e 7):

1. Backend: áudio de 3 → 8 créditos, medidor de disparos, Whisper turbo, UUID → índice curto no prompt
2. A demonstração precisa ser revisada contra o painel real antes do lançamento
3. Trocar o e-mail do encarregado nos documentos legais quando o domínio existir
4. A Opção A da página de exclusão (botão no painel) volta no ciclo 3
