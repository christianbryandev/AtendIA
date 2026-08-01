# Landing Page do AtendIA — Especificação de Design

**Data:** 2026-08-01
**Autor:** Christian Bryan Pereira + Claude
**Status:** aprovado para planejamento

---

## 1. Contexto e escopo

O AtendIA é um SaaS multi-tenant de delivery com atendimento por IA no WhatsApp.
O backend existe e está funcional; o frontend praticamente não existe. Esta spec
cobre **apenas a landing page e as páginas institucionais/legais**.

### Decomposição do projeto

O trabalho até "pronto para lançar" tem cinco subsistemas independentes. Cada um
recebe seu próprio ciclo spec → plano → implementação:

| # | Subsistema | Estado | Ciclo |
|---|---|---|---|
| 1 | **Landing page + páginas legais** | não existe | **esta spec** |
| 2 | Cadastro + cobrança (trial, assinatura) | não existe | próximo |
| 3 | Painel + PDV/Kanban | não existe | depois |
| 4 | Gerenciador de cardápio | não existe | depois |
| 5 | Confirmação de pagamento PIX | não existe | depois |

### Fora de escopo nesta spec

- Qualquer código de pagamento, gateway ou formulário de cartão
- Cadastro real de usuário (a rota `/cadastro` recebe um placeholder)
- Qualquer tela do painel

### Conteúdo jurídico — incluído como minuta

Decisão revista em 2026-08-01: as minutas de Termos de Uso, Política de
Privacidade e Instruções de Exclusão de Dados **serão redigidas nesta entrega**,
como texto original derivado do sistema real (ver seção 7).

Descartado copiar/adaptar os documentos de concorrente: além de violação de
direito autoral (Lei 9.610/98), a política descreveria uma operação que não é a
do AtendIA — sob a LGPD isso vira declaração formal incorreta, e a revisão de
app da Meta compara a política com o comportamento real do aplicativo.

### Critério de sucesso

Um visitante entende em menos de 30 segundos o que o produto faz, para quem
serve e quanto custa; encontra os documentos legais por URL própria; e a página
está pronta para receber o link do cadastro sem precisar ser reescrita.

---

## 2. Decisões de produto

| Tema | Decisão |
|---|---|
| Preço | **R$ 179,99/mês**, plano único |
| Oferta | **"Teste sem risco por 7 dias — não gostou, devolvemos 100%"** |
| Cobrança | Cartão debitado na entrada; reembolso a pedido em até 7 dias |
| CTA principal | "Começar agora" → `/cadastro` |
| Prova social | **Nenhuma.** Sem contador de clientes, depoimento, logo ou métrica |

### Por que não é "7 dias grátis"

A oferta cobra o cartão no ato. Anunciar como "grátis" configuraria publicidade
enganosa (CDC, Art. 37 §1º), com exposição direta do MEI cujo CNPJ está no
rodapé. Além disso, o Art. 49 do CDC já garante arrependimento em 7 dias em
compras online — o reembolso é obrigação legal, não diferencial. A redação
adotada é honesta e continua sendo forte comercialmente.

### Por que nenhuma prova social

O produto não tem clientes ainda. A referência visual (foodclub.com.br) dedica
metade da página a prova social que ela possui de fato. Copiar esse esqueleto
deixaria seções vazias ou induziria a inventar números. **A demonstração do
produto substitui a prova social.**

---

## 3. Modelo de créditos

### Custo real apurado (agosto/2026, câmbio assumido R$ 5,40)

Modelos em uso: `gpt-4o-mini`, `tts-1`, `whisper-large-v3`.

| Evento | Composição | Custo |
|---|---|---|
| Mensagem de texto | gpt-4o-mini (~4.000 tok entrada + 150 saída) | **≈ R$ 0,004** |
| Mensagem de áudio | Whisper + gpt-4o-mini + **TTS (76% do total)** | **≈ R$ 0,035** |
| Disparo de reativação | Template de marketing WhatsApp | **≈ R$ 0,35** |

**Áudio custa ~9x um texto, não 3x.** A regra atual do código (`custoCreditos =
messageType === 'audio' ? 3 : 1` em `src/server.ts`) subsidia cada áudio em
cerca de dois terços do custo — justamente no recurso que mais diferencia o
produto.

**Mensagens de atendimento não pagam WhatsApp.** Respostas dentro da janela de
24h iniciada pelo cliente são gratuitas e sem teto na cobrança da Meta. Só
mensagens iniciadas pelo negócio (templates) são pagas.

### Nova tabela

| Evento | Regra atual | Nova regra |
|---|---|---|
| Texto | 1 crédito | **1 crédito** |
| Áudio | 3 créditos | **8 créditos** |
| Disparo de reativação | não medido | **medidor separado** |

Atendimento e disparo de campanha têm economias que diferem por quase 100x.
Medi-los juntos esconderia o custo e confundiria o cliente.

### Cota do plano

- **10.000 créditos de IA/mês** — ilustrado como "atende ≈300 pedidos/mês"
- **100 disparos de campanha/mês** — teto de ≈R$ 35
- Excedente vendido em pacotes avulsos dentro do painel (ciclo futuro)

**Teto de custo variável: ≈R$ 85** (47% da receita), no cenário improvável de o
cliente esgotar as duas cotas. A maioria consumirá bem menos.

Os disparos foram cortados de 300 para 100 porque 300 × R$ 0,35 = R$ 105
consumiria 58% da receita num único item — e, somado ao teto dos créditos,
zeraria a margem justamente no cliente que mais usa o produto. Diferente das
estimativas de consumo de IA, esse número não é estimativa: é preço tabelado da
Meta.

### Quantos pedidos os 10.000 créditos cobrem

A conversa média **não** tem 10 mensagens. Mistura realista, considerando que o
sistema guarda `ultimo_pedido_json` para repetição em um clique:

| Tipo de conversa | Fatia | Mensagens |
|---|---|---|
| Recorrente ("o de sempre") | 40% | ~3 |
| Novo / indeciso | 35% | ~9 |
| Curioso que não compra | 25% | ~3 |

A cada 100 conversas: 510 mensagens → 75 pedidos = **6,8 mensagens por pedido**,
já embutindo o desperdício de quem não compra.

**O limite é definido pela fatia de áudio, não pelo tamanho da conversa:**

| Fatia de áudio | Créditos/pedido | Pedidos com 10.000 |
|---|---|---|
| 30% | 21 | ~475 |
| 50% | 30 | ~330 |
| 60% | 35 | ~285 |

Pior caso realista — restaurante recém-chegado, sem base de recorrentes, com 50%
de áudio: **~220 pedidos**. Daí o "≈300" ser uma ilustração conservadora e
defensável, com nota de rodapé explicando que o consumo varia conforme o uso de
áudio.

### Confiança dos números

- **Sólido:** preços de API; a razão de ~9x entre áudio e texto; o custo dos
  templates de marketing da Meta
- **Estimado:** tokens por mensagem, duração dos áudios, mix texto/áudio, câmbio,
  distribuição dos tipos de conversa
- **Desconhecido:** volume real de pedidos e fatia real de áudio dos clientes

A tabela `creditos_ia` já registra cada consumo. **Medir o uso real dos
primeiros clientes antes de tratar a cota como compromisso contratual.** É mais
fácil aumentar cota do que reduzir com cliente dentro.

### O que desta seção é backend, não landing

Esta spec define o modelo de créditos porque **a landing precisa anunciá-lo**.
Implementá-lo é trabalho de backend e **não faz parte desta entrega**:

- Alterar a razão de áudio de 3 para 8 créditos (`src/server.ts`, cálculo de
  `custoCreditos`)
- Criar o medidor separado de disparos de campanha
- Trocar `whisper-large-v3` por `whisper-large-v3-turbo`: 2,8x mais barato
  (US$ 0,04/h vs US$ 0,111/h), diferença de qualidade marginal
- **Substituir o UUID pelo índice curto no cardápio do prompt.** Em
  `openai-agent.ts` cada produto entra como
  `- [ID: 550e8400-e29b-41d4-a716-446655440000] Nome ...`; o UUID custa ~20
  tokens e tokeniza mal. Usando `[ID: 42]` com mapeamento no código, economiza
  ~1.200 tokens por mensagem num cardápio de 60 itens — **~34% do custo do LLM**

**Dependência:** esses três itens precisam estar prontos antes de a landing ir
ao ar, senão a página anuncia uma regra de cobrança que o sistema não aplica.
Entram no ciclo 2 (cadastro + cobrança) ou num ciclo próprio de backend.

---

## 4. Arquitetura

Landing e painel vivem no **mesmo app React**, com separação por code splitting.

Descartadas: projeto estático separado (duplicaria o design system, que diverge
em semanas) e pré-renderização via `vite-plugin-ssg` (mais uma peça na cadeia de
build). A migração de A para C, se o SEO virar prioridade, é barata; desfazer
dois design systems divergidos, não.

### Rotas

| Rota | Conteúdo | Carregamento |
|---|---|---|
| `/` | Landing page | imediato |
| `/sobre` | Sobre a empresa | imediato |
| `/termos` | Termos de Uso | imediato |
| `/privacidade` | Política de Privacidade | imediato |
| `/exclusao-de-dados` | Instruções de Exclusão de Dados | imediato |
| `/cadastro` | Placeholder digno → cadastro real depois | imediato |
| `/login` | Login | lazy |
| `/app/*` | Painel | lazy |

As três rotas legais são **exigidas pela verificação de app da Meta**, que pede
URLs públicas e estáveis para cada uma.

### Estrutura de pastas

```
frontend/src/
├── design/            # tokens de cor, espaçamento, tipografia
├── components/ui/     # Button, Input, Card, Section
├── components/layout/ # Header, Footer, Container
├── pages/site/        # Landing, Sobre, Termos, Privacidade, ExclusaoDados, Cadastro
├── pages/app/         # painel (ciclos futuros)
└── services/          # api.ts (existente), auth
```

A fronteira do code splitting fica entre `pages/site/` e `pages/app/` —
explícita no disco, não só na configuração.

### Correções de base a aplicar

- `react-router-dom` está em `devDependencies` — dependência de runtime, move para `dependencies`
- `public/logo.png` está na versão antiga (gradiente roxo/laranja) — remover
- Logo verde: o vetor original **não existe** (confirmado com o Christian). O
  arquivo disponível é auto-trace monocromático de 14 sub-traçados. Dividir por
  faixa de coordenada — ícone (y < 730), "Atend" e "IA" — e recolorir conforme o
  design system. Curvas são aproximadas; aceitável para web

---

## 5. Design system

### Cores

```js
// tailwind.config.js
colors: {
  brand: { 50:'#ECFDF5', 500:'#10B981', 700:'#047857', 900:'#064E3B' },
  ink:   { 600:'#57534E', 800:'#292524' },
}
```

**A regra dos dois verdes.** O verde da logo (`#10B981`) com texto branco tem
contraste de 2,6:1 — abaixo do mínimo WCAG AA de 4,5:1. Usuários com baixa
visão, celular sob sol forte ou monitor de cozinha não conseguem ler.

- `#10B981` → ícones, ilustrações, fundos suaves, detalhes
- `#047857` → botões e qualquer elemento com texto (contraste 5,6:1) ✅

### Tipografia

**Inter**, carregada localmente via `@fontsource/inter`. Não usar Google Fonts:
a chamada envia o IP de cada visitante ao Google sem consentimento — atrito
desnecessário com a LGPD, com o CNPJ do MEI no rodapé.

### Tom visual

Fundo branco alternando com `#FAFAF9`. Sem gradientes. Cantos de 8px, sombras
discretas, bastante espaço em branco. Ícones em traço, não preenchidos.

---

## 6. Estrutura de conteúdo da landing

| # | Seção | Função |
|---|---|---|
| 1 | Cabeçalho fixo | Logo · Como funciona · Recursos · Preço · Perguntas · Entrar · CTA |
| 2 | Hero | Promessa + CTA + demonstração de conversa do WhatsApp |
| 3 | Problema → solução | Duas colunas sobre a dor do leitor |
| 4 | Como funciona | 4 passos: conectar · cardápio · IA atende · pedido no painel |
| 5 | Recursos | 3 blocos grandes + grade secundária |
| 6 | Demonstração | Conversa completa + pedido aparecendo no painel |
| 7 | Preço | Card único, cota, garantia |
| 8 | Perguntas frequentes | Objeções reais |
| 9 | Chamada final | Repete a oferta, sem urgência falsa |
| 10 | Rodapé | Links legais + razão social + CNPJ |

### Hero

> **Seu WhatsApp vendendo sozinho, 24 horas por dia**
> A IA atende por texto e por áudio, monta o pedido, calcula a entrega e o troco
> — e joga tudo direto no seu PDV. Sem contratar mais ninguém.

CTA "Começar agora" + "Ver como funciona" (âncora para a demonstração).
Abaixo, discreto: *Teste sem risco por 7 dias · Cancele quando quiser*.

### Destaque de diferencial

A IA **ouve áudio e responde em áudio**. Cliente de delivery manda áudio o tempo
todo. Deve ter destaque próprio, não ser enterrado numa lista de recursos.

### Card de preço

Número grande na língua do lojista (**pedidos**), número contratual em cinza
abaixo (**créditos**), com ⓘ expansível explicando "texto usa 1, áudio usa 8".
Loja de créditos mencionada em uma linha discreta.

O "≈300 pedidos" é **estimativa ilustrativa** e deve aparecer com "≈" e nota de
rodapé: *"estimativa de uso médio; o consumo varia conforme quanto do seu
atendimento for por áudio. O limite contratual são os 10.000 créditos."* Sem
isso, vira promessa não controlável — mesmo risco de CDC da oferta.

### FAQ

Preciso trocar meu número? · Funciona com o número que já uso? · E se a IA errar
um pedido? · Meu cardápio do iFood entra automático? · **E se meus créditos
acabarem no meio do mês?** · Posso cancelar quando quiser? · Meus dados e os dos
meus clientes estão seguros?

A pergunta sobre esgotamento da cota é obrigatória: os Termos preveem suspensão
do atendimento automático (painel e PDV seguem funcionando), e o comprador
precisa saber disso **antes** de pagar.

### Rodapé

Produto (Recursos, Preço, Perguntas) · Empresa (Sobre) · Legal (Termos,
Privacidade, Exclusão de Dados). Ao final:

```
67.146.802 CHRISTIAN BRYAN PEREIRA — CNPJ 67.146.802/0001-85
```

---

## 7. Riscos e pendências registradas

### A demonstração precisa ser revisada antes do lançamento

A conversa e o painel exibidos serão ilustrações em HTML/CSS de funcionalidade
real — não capturas falsas. Mas o painel ainda não existe. **Antes de publicar,
revisar a demonstração contra o produto pronto** e corrigir divergências. Caso
contrário vira promessa falsa.

### Conteúdo jurídico: minuta original, revisão posterior

As minutas serão redigidas a partir do sistema real, não de modelo genérico nem
de documento de terceiros. Base factual já levantada do código:

- **Dados coletados:** `clientes_crm` guarda nome, telefone WhatsApp, endereço de
  entrega, histórico de pedidos e LTV dos clientes finais dos restaurantes
- **Transferências internacionais** (LGPD Art. 33), a declarar nominalmente:
  áudio → Groq (transcrição); texto → OpenAI (conversação e síntese de voz);
  mensagens → Meta (WhatsApp Cloud API)
- **Papéis LGPD:** controlador dos dados dos restaurantes; **operador** dos dados
  dos clientes finais deles
- **Segurança implementada, declarável:** tokens de integração em AES-256-CBC,
  senhas em bcrypt, isolamento por tenant via RLS, HMAC SHA-256 no webhook

**Limite explícito:** a minuta não é documento juridicamente validado. Cláusulas
de limitação de responsabilidade, foro, rescisão e inadimplência têm implicações
que a redação aqui não garante. Revisão por advogado recomendada após a primeira
receita — revisar texto pronto custa fração de redigir do zero, e o SEBRAE
oferece orientação jurídica gratuita a MEI.

**Decisões tomadas** (2026-08-01), já refletidas nas minutas:

| Tema | Decisão |
|---|---|
| Retenção após cancelamento | 90 dias; dados fiscais 5 anos, separados |
| Encarregado de dados | christianpereira.mtx@gmail.com — **trocar por `privacidade@<domínio>`** quando o domínio existir |
| Foro | Comarca de Ribeirão Preto/SP |
| Cancelamento | Sem multa, sem fidelidade, acesso até o fim do período pago |

**Minutas escritas e commitadas** em `docs/legal/`: `privacidade.md`,
`termos.md`, `exclusao-de-dados.md`. A implementação converte esses arquivos em
páginas React.

⚠️ A página de exclusão descreve um botão "Excluir minha conta" no painel, que
ainda não existe. **Até o ciclo 3, exibir apenas a Opção B (e-mail).**

### Dados de cartão nunca passarão pelo servidor

Quando a cobrança for implementada (ciclo 2), usar o componente do próprio
gateway, que coleta o cartão no navegador e devolve um token. Mantém o projeto
fora do escopo pesado do PCI-DSS.

### Nenhuma abstração de pagamento agora

Criar camada de pagamento antes de escolher o gateway produz a abstração errada.
Mercado Pago, Stripe e Asaas têm fluxos distintos. A integração entra no ciclo 2,
sob medida.

---

### Envio do cardápio em PDF/imagem (ciclo 3/4)

A IA deve poder **enviar** o cardápio em PDF ou imagem quando o cliente pedir.
Custo desprezível: mídia dentro da janela de 24h é gratuita na Meta, e ainda
reduz tokens de saída e caracteres de TTS, já que a IA para de narrar o cardápio.

**O arquivo não substitui o cardápio estruturado.** A IA continua precisando dos
produtos no banco para informar preço, calcular total e chamar `finalizar_pedido`
com os IDs corretos — um PDF é imagem para humano, não dado. Se o lojista subir
só o arquivo e não cadastrar produtos, o atendimento automático não funciona; o
painel precisa deixar isso explícito no cadastro.

Falta implementar: `sendWhatsAppDocumentMessage`/`sendWhatsAppImageMessage`
(hoje `meta-cloud-api.ts` só envia texto e áudio), campo de arquivo em
`restaurantes` com upload no Storage, e uma ferramenta `enviar_cardapio`
acionável pela IA.

Só pode ser anunciado na landing se estiver funcionando quando ela for ao ar.

---

## 8. Aprovação

Blocos 1 (arquitetura), 2 (design system) e 3 (conteúdo) aprovados por Christian
em 2026-08-01, com os ajustes de cota acordados na revisão final. Próximo passo:
plano de implementação.
