# Ciclo 2 — Cadastro e cobrança

Data: 2026-08-02
Status: aprovado, pronto para virar plano de implementação

## Objetivo

Permitir que um restaurante crie conta, pague a assinatura e tenha o painel
liberado — sem intervenção manual. Destrava três promessas que a landing já
faz e que hoje não existem em código: cancelar quando quiser, comprar créditos
avulsos e ser avisado quando a cota acabar.

## Escopo

**Dentro:** cadastro, Stripe Checkout hospedado, webhooks, split de créditos
(cota mensal + avulsos), compra de pacotes avulsos, Customer Portal para
cancelamento e faturas, faixa de aviso de cota no painel, trava de acesso por
assinatura.

**Fora:** onboarding (conectar WhatsApp, subir cardápio), e-mail transacional,
recuperação de senha, ligar o TTS. Tudo isso é ciclo 3.

**Por que o onboarding ficou fora:** conectar o WhatsApp depende da verificação
da empresa e do app na Meta, que ainda não foi feita. O passo não pode ser
validado de ponta a ponta hoje.

**Por que o e-mail ficou fora:** depende da conta Resend, que ainda não foi
contratada. Manter o ciclo 2 sem nenhuma dependência externa nova além do
Stripe. O aviso de cota fica só no painel.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Gateway | Stripe (já registrado em decisão anterior) |
| Modo de pagamento | Checkout hospedado — fora do escopo PCI |
| Ordem | Conta primeiro (status `pendente`), depois pagamento |
| Dados do cadastro | Nome, e-mail, senha, nome do restaurante, CNPJ, endereço |
| Trial de 7 dias | Cobra na contratação, reembolso manual pelo painel do Stripe |
| Créditos | Cota mensal reseta; avulsos não expiram |
| Pacotes avulsos | 2.500 / R$59,90 · 5.000 / R$109,90 · 10.000 / R$199,90 |
| Cota zerada | IA para de responder; cliente final recebe a mensagem de indisponibilidade que já existe; lojista vê faixa no painel |
| Custo do áudio | Sobe de 3 para 8 créditos, alinhando com a landing |
| Cancelamento | Customer Portal hospedado do Stripe |
| Fonte de verdade | Estado espelhado no Postgres; webhook é a única caneta |

### Sobre o custo do áudio

A landing anuncia 8 créditos por resposta em áudio; o código cobra 3
(`src/server.ts`). Os dois números descrevem produtos diferentes.

Hoje o fluxo transcreve o áudio recebido (Groq Whisper) e responde **em texto**.
O módulo `src/services/ai/openai-tts.ts` está escrito e não é chamado em lugar
nenhum. Custo aproximado por mensagem, pelas tabelas públicas dos provedores:

- Texto: `gpt-4o-mini` — cerca de US$ 0,0004
- Áudio hoje: Whisper + `gpt-4o-mini` — cerca de US$ 0,0007 (1,7× o texto)
- Áudio com voz: acrescenta `tts-1` — cerca de US$ 0,005 (~12× o texto)

O TTS domina o custo. Decisão: manter o 8 da landing desde já e ligar o TTS no
ciclo 3, quando a promessa passa a ser verdadeira. O ciclo 2 só ajusta
`custoCreditos` de 3 para 8.

## Arquitetura

O estado da assinatura vive no Postgres, espelhado do Stripe via webhook. Todo
o resto do sistema — painel, PDV, o webhook do WhatsApp decidindo se a IA
responde — lê do banco local. Nenhuma chamada ao Stripe no caminho crítico do
atendimento: se o Stripe cair, os restaurantes continuam vendendo.

O preço disso é uma janela de segundos entre pagar e o webhook chegar, coberta
por uma tela de confirmação com polling.

## Modelo de dados

Migration nova: `006_assinaturas_creditos.sql`.

### Tabela `assinaturas`

Uma linha por restaurante.

- `restaurante_id` (FK, único)
- `stripe_customer_id`, `stripe_subscription_id`
- `status`: `pendente` · `ativa` · `inadimplente` · `cancelada` · `reembolsada`
- `periodo_fim`, `cancelada_em`
- RLS por tenant, no mesmo padrão de `creditos_ia`

Só o handler de webhook escreve nesta tabela.

### Split do saldo de créditos

`restaurantes.creditos_disponiveis` (inteiro único) é substituído por:

- `creditos_cota` — reseta a cada renovação
- `creditos_avulsos` — não expiram

A RPC `consumir_creditos_ia` passa a debitar da cota primeiro e do avulso
depois, dentro do mesmo `FOR UPDATE` que já existe. A assinatura da função não
muda, então nenhum código de atendimento precisa ser alterado.

`creditos_ia` ganha a coluna `origem` (`cota` ou `avulso`), registrando de qual
saldo cada consumo saiu. `reembolsar_creditos_ia` devolve ao mesmo saldo de
onde debitou — devolver para a cota um crédito avulso faria o lojista perder na
virada do mês algo que ele comprou.

### Tabela `stripe_eventos_processados`

`event_id` como chave primária, espelhando `webhook_eventos_processados`. Sem
isso, um reenvio do Stripe credita 10.000 créditos duas vezes.

### Campos novos em `restaurantes`

`cnpj`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`.

`restaurantes.email_acesso` e `restaurantes.senha_acesso` são resquício — o
login real usa a tabela `usuarios`. O cadastro não escreve neles, para não
criar duas verdades sobre a mesma senha.

## Fluxo de cadastro e checkout

1. **`/cadastro`** — formulário real no lugar da placeholder atual. CNPJ
   validado pelos dígitos verificadores, não só pelo formato. CEP consultado no
   ViaCEP para preencher o endereço.

2. **`POST /api/auth/cadastro`** — cria em uma transação: `restaurantes`,
   `usuarios` (bcrypt) e `assinaturas` com status `pendente`. Devolve o mesmo
   JWT de 12h que o login emite, com `sub = restaurante_id`, formato que o RLS
   já espera.

3. **`POST /api/billing/checkout`** — rota autenticada. Cria o Customer no
   Stripe, guarda o `stripe_customer_id` e abre uma Checkout Session em modo
   `subscription`, com `client_reference_id = restaurante_id` e metadata do
   tenant. Devolve a URL para o front redirecionar.

4. **`/assinatura/confirmando`** — tela de retorno. Faz polling de
   `GET /api/billing/status` a cada 2s por até 30s. Confirmou, entra no painel.
   Estourou o tempo, mostra "pagamento recebido, estamos liberando seu acesso"
   em vez de fingir falha.

5. **Trava de acesso** — middleware `exigirAssinaturaAtiva` nas rotas do painel
   e a mesma checagem no `ProtectedRoute` do front. Front é conveniência,
   backend é segurança.

Quem abandona o Checkout retoma pelo login normal, sem recadastrar.

## Webhooks do Stripe

Rota única: `POST /api/webhooks/stripe`.

**Corpo cru.** Verificar o header `stripe-signature` exige o corpo exatamente
como veio. O `express.json()` global de `src/server.ts` já preserva isso em
`req.rawBody` pela opção `verify` — o mesmo mecanismo que o webhook da Meta
usa. Nenhum parser adicional é necessário; basta passar `req.rawBody` para
`stripe.webhooks.constructEvent`.

**Idempotência primeiro.** Todo evento tenta inserir seu `event.id` em
`stripe_eventos_processados`. Violação de unique responde 200 e sai.

**Resposta rápida.** Responde 200 imediatamente e processa em segundo plano,
como o webhook do WhatsApp já faz.

| Evento | Ação |
|---|---|
| `checkout.session.completed` (modo `subscription`) | `ativa`, guarda `subscription_id`, credita 10.000 na cota |
| `checkout.session.completed` (modo `payment`) | Soma o pacote em `creditos_avulsos` |
| `invoice.paid` | Reseta `creditos_cota` para 10.000 e avança `periodo_fim` |
| `invoice.payment_failed` | `inadimplente`; painel continua abrindo com aviso |
| `customer.subscription.deleted` | `cancelada`, zera a cota, preserva avulsos |
| `charge.refunded` | `reembolsada`, zera a cota |

A distinção entre primeira fatura e renovação usa o `billing_reason` que o
próprio Stripe envia, não heurística de data — senão o primeiro mês credita
20.000.

**Webhook perdido:** `GET /api/billing/status` consulta o Stripe diretamente
quando o banco disser `pendente` há mais de 5 minutos, e se auto-corrige. É
reconciliação sob demanda, sem cron.

## Telas do painel

Rotas novas em `frontend/src/App.tsx`, todas com lazy loading, para não entrar
no bundle da landing.

- **`/assinatura/confirmando`** — polling do passo 4. Protegida por login, não
  por assinatura.
- **`/app/assinatura`** — status, valor, próxima cobrança. Botão "Gerenciar
  assinatura" chama `POST /api/billing/portal` e redireciona ao Customer Portal.
  Botão "Comprar créditos".
- **`/app/creditos`** — os três pacotes, cada um abrindo um Checkout em modo
  `payment`. Abaixo, o extrato de consumo, que sai direto da tabela
  `creditos_ia` já existente.
- **Faixa de aviso de cota** — componente no topo de qualquer tela do painel.
  Âmbar e informativa em 80%; vermelha em 100%, dizendo que a IA parou de
  responder, com o botão de compra ao lado.

**Estado:** um `AssinaturaContext` carregado no login e revalidado ao voltar do
Stripe. Sem ele, cada tela consulta por conta própria e a faixa pisca a cada
navegação.

**`ProtectedRoute`** ganha a prop `exigirAssinatura`. Quem está `pendente` vai
para o checkout; quem está `inadimplente` passa, com a faixa de aviso — cortar
o acesso de quem teve o cartão recusado uma vez perde cliente à toa.

## Erros

| Falha | Comportamento |
|---|---|
| Webhook nunca chega | `GET /api/billing/status` consulta o Stripe após 5 min em `pendente` |
| Webhook chega duas vezes | Barrado por `stripe_eventos_processados` antes de creditar |
| Lojista abandona o Checkout | Conta fica `pendente`; retoma pelo login |
| Tentativa de assinar duas vezes | `POST /api/billing/checkout` recusa se `assinaturas.status` já é `ativa`. O Stripe **não** impede duas assinaturas do mesmo preço para o mesmo Customer — a trava é nossa, senão o lojista é cobrado em dobro |
| ViaCEP fora do ar | O endereço vira digitação manual; o cadastro não trava por causa disso |
| CNPJ já cadastrado | 409 com mensagem clara, antes de tocar no Stripe |
| Stripe indisponível no cadastro | Conta criada e `pendente`; a tela oferece nova tentativa |
| Cartão recusado na renovação | `inadimplente`: painel abre com aviso, IA continua atendendo durante as retentativas do Stripe |

## Testes

O backend não tem framework de teste — só os scripts manuais em `scripts/`.
Subir Vitest no backend, mesmo runner do frontend.

**Backend, com Stripe mockado:**

- Cadastro: CNPJ inválido, e-mail duplicado, hash bcrypt, criação das três linhas
- Webhook: assinatura inválida rejeitada, evento repetido não credita duas
  vezes, `billing_reason` distingue primeira fatura de renovação

**Contra Postgres real** (testar `plpgsql` com mock não prova nada):

- Consome da cota primeiro, cai no avulso quando a cota zera
- Recusa quando ambos zeram
- Reset mensal não apaga avulsos
- Reembolso volta ao saldo de origem, não sempre para a cota

**Frontend:**

- Formulário de cadastro: validações e envio
- Tela de confirmando: polling que resolve e polling que estoura
- `ProtectedRoute` com `exigirAssinatura`

## Ordem de implementação

Migration e RPC → cadastro → checkout → webhook → telas do painel.

Cada etapa testável antes da seguinte.

## Dependências externas

**Bloqueante:** conta Stripe ativa em nome do MEI. O Stripe exige entidade
habilitada no Brasil — confirmar que o MEI passa no cadastro antes de construir
em cima.

**Não bloqueante:** ViaCEP, para autopreencher o endereço no cadastro. Gratuito
e sem chave. Se estiver fora do ar, o lojista digita o endereço à mão — o
cadastro não pode travar por causa de um serviço de conveniência.

## Nota para o ciclo 3

Antes de qualquer código, provisionar credenciais: Resend (domínio já
comprado), Meta/WhatsApp Cloud API, OpenAI, Groq, iFood. Hoje as quatro últimas
são opcionais em `src/config/env.ts` e precisam virar reais.

Escopo do ciclo 3: onboarding (conectar WhatsApp; cardápio por digitação,
importação do iFood, cardápio digital ou PDF), ligar o TTS, e-mail transacional
e recuperação de senha.
