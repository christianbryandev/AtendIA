# Ciclo 4 — Confiabilidade da IA e do CRM: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que a IA só afirme o que pode verificar, que a caixa de entrada mostre tudo que aconteceu de verdade, e que a base de contatos — hoje vazia — passe a existir, destravando CRM, fidelização e campanhas de reativação.

**Architecture:** Três frentes que se tocam no mesmo ponto do webhook. Primeiro o CRM, que hoje falha por duas causas empilhadas (cliente anon bloqueado por RLS, e colunas que não existem). Depois o horário de funcionamento, como função pura avaliada antes do consumo de créditos, no mesmo lugar onde `decidirAtendimento` já barra conversa sob controle humano. Por fim, os tipos de mensagem que hoje somem — imagem, documento e localização — tratados como primeira classe, e os complementos do cardápio finalmente chegando ao prompt.

**Tech Stack:** Node + Express + TypeScript (ESM), Supabase/Postgres, OpenAI (`gpt-4o-mini`, com visão), Groq (`whisper-large-v3`), WhatsApp Cloud API, React 19 + Vite + Tailwind, Vitest nos dois lados.

**Spec:** `docs/superpowers/specs/2026-08-04-ciclo4-confiabilidade-ia-design.md`

## Global Constraints

- **Todo texto visível ao usuário e todo comentário de código em português brasileiro.**
- **Commits em português,** padrão `tipo: Descrição no imperativo`, sem acentos no título, com rodapé `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Imports em `src/` usam extensão `.js`** (ESM).
- **`supabaseAdmin` faz bypass de RLS.** Filtrar por `restaurante_id` explicitamente, sempre, em SELECT, UPDATE e DELETE.
- **Todo `{ data, error }` do Supabase precisa ter o `error` verificado.** O cliente não lança sozinho. Este ciclo existe em parte porque essa regra foi violada.
- **Nunca usar o cliente `supabase` (anon) no backend.** Sempre `supabaseAdmin`. O anon é bloqueado pela RLS quando não há JWT de usuário.
- **Migrations idempotentes** (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`), no padrão da `009`, `011` e `012`.
- **Custo em créditos:** texto = 1, imagem = 3, áudio = 8. Cota mensal de 10.000.
- **Janela da Meta:** 24 horas desde a última mensagem **do cliente**. Fora dela, só template aprovado.
- **Paleta do frontend:** `brand-*`, `ink-*`, `stone-*`. Label associado a cada campo, `role="alert"` nos erros.
- **Não alterar** `src/database/creditos.test.ts` nem `src/database/isolamento-realtime.test.ts` — escrevem no Supabase real.
- **`npm run build` usa `tsconfig.build.json`**, que exclui os testes.
- **A suíte do frontend leva ~150s e falha 1 em cada 3 execuções por timeout**, tipicamente em `App.test.tsx`. Confirmar que é timeout antes de concluir que quebrou algo.

## Descoberta que molda a Task 1 e a Task 2

`reactivation.ts` insere colunas que **não existem** em `clientes_crm`. As colunas reais são:

- De `schema.sql`: `id`, `restaurante_id`, `telefone_whatsapp`, `nome`, `total_pedidos`, `valor_total_gasto`, `ultimo_pedido_at`, `ultimo_pedido_json`, `created_at`
- Da migration `003`: `estagio_pipeline`, `problema_ativo`, `bloqueio_cron_manual`, `ultima_mensagem_em`

O código usa, e **não existem**: `logradouro`, `numero`, `bairro`, `cidade`, `complemento`, `opt_in_marketing`, `updated_at`, `tags`, `pontos_fidelidade`.

Decisão para este ciclo: **criar só o que serve a uma entrega contratada**, e remover do código o resto.

- `opt_in_marketing` — **criar**. É consentimento para campanha; sem ele, reativação não tem base legal nem filtro.
- `pontos_fidelidade` — **criar**. Fidelização está no contrato e `addLoyaltyPoints` já existe.
- `updated_at` — **criar**. Trivial e já esperado pelo código.
- `tags` — **não criar**. `estagio_pipeline` já cumpre o papel; a campanha passa a usá-lo.
- Campos de endereço — **remover do código**. O endereço pertence ao pedido, não ao contato, e nada os popula hoje.

## File Structure

**Backend — criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/database/migrations/013_horario_e_crm.sql` | Colunas de horário/loja em `restaurantes` e as três colunas faltantes em `clientes_crm` |
| `src/services/restaurante/horario.ts` | Cálculo puro de "está aberto agora?" e próximo horário |
| `src/services/restaurante/horario.test.ts` | Testes da função pura |
| `src/services/crm/crm-repo.test.ts` | Prova que uma mensagem recebida cria a linha em `clientes_crm` |

**Backend — modificar:** `src/services/crm/reactivation.ts` (cliente, erros, schema, template), `src/services/ifood/ifood-api.ts` (só cliente e erros), `src/services/cardapio/cardapio-repo.ts` e `cardapio-para-ia.ts` (complementos), `src/services/ai/openai-agent.ts` (prompt), `src/server.ts` (webhook: tipos de mídia, horário, custo).

**Frontend — modificar:** `frontend/src/pages/app/Configuracoes.tsx` (horário e informações da loja), `frontend/src/components/app/Conversa.tsx` (imagem, documento, localização).

**Ordem das tarefas:** 1 → 2 (CRM, o mais grave) → 3 → 4 (horário) → 5 (complementos) → 6 → 7 (mídia) → 8 (tela) → 9 (campanha). Ordenado por risco: se faltar tempo, o que fica de fora é o menos crítico.

---

## Task 1: Migration das colunas de horário e do CRM

**Files:**
- Create: `src/database/migrations/013_horario_e_crm.sql`

**Interfaces:**
- Consumes: nada
- Produces: colunas `horario_funcionamento`, `fuso_horario`, `pedido_minimo`, `informacoes_adicionais` em `restaurantes`; `opt_in_marketing`, `pontos_fidelidade`, `updated_at` em `clientes_crm`

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- 013_horario_e_crm.sql
-- Ciclo 4: confiabilidade da IA e do CRM.
--
-- Duas frentes na mesma migration porque as duas são só colunas
-- novas, sem lógica.
--
-- 1. HORÁRIO E DADOS DA LOJA. A IA afirmou "entregamos até as 22h"
--    para um cliente real — um horário que não existe em lugar
--    nenhum do sistema. Sem esses campos ela não tem como saber, e
--    preenche a lacuna inventando.
--
-- 2. COLUNAS FALTANTES DO CRM. reactivation.ts insere colunas que
--    nunca foram criadas. Somado ao uso do cliente anon (corrigido
--    na Task 2), é o motivo de clientes_crm estar vazia desde
--    sempre, derrubando CRM, fidelização e reativação de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1. HORÁRIO E DADOS DA LOJA
-- ------------------------------------------------------------
-- JSONB em vez de sete pares de colunas porque a estrutura é
-- irregular: um dia pode ter zero faixas (fechado), uma, ou duas
-- (intervalo entre almoço e jantar). Formato esperado:
--   {"seg":[{"abre":"11:00","fecha":"14:00"},
--           {"abre":"18:00","fecha":"23:00"}],
--    "dom":[]}
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS horario_funcionamento JSONB;

-- Sem fuso, "está aberto agora?" é indefinido: o servidor roda em
-- Oregon e o restaurante atende em Ribeirão Preto.
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS fuso_horario VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS pedido_minimo NUMERIC(10,2);

-- Texto livre para o que a IA só precisa repetir: prazo de entrega,
-- bairros atendidos, formas de pagamento, política de troca.
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS informacoes_adicionais TEXT;

-- ------------------------------------------------------------
-- 2. COLUNAS FALTANTES DO CRM
-- ------------------------------------------------------------
-- Consentimento para campanha de reativação. Sem ele não há filtro
-- nem base para disparar marketing.
ALTER TABLE clientes_crm
  ADD COLUMN IF NOT EXISTS opt_in_marketing BOOLEAN NOT NULL DEFAULT TRUE;

-- Fidelização está no contrato e addLoyaltyPoints já espera esta coluna.
ALTER TABLE clientes_crm
  ADD COLUMN IF NOT EXISTS pontos_fidelidade INT NOT NULL DEFAULT 0;

ALTER TABLE clientes_crm
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

- [ ] **Step 2: Aplicar no Supabase**

Rodar o conteúdo no SQL Editor. Esperado: `Success. No rows returned`. Rodar uma segunda vez para confirmar a idempotência — deve passar igual.

- [ ] **Step 3: Conferir**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'clientes_crm'
  AND column_name IN ('opt_in_marketing','pontos_fidelidade','updated_at');
```

Esperado: três linhas.

- [ ] **Step 4: Commit**

```bash
git add src/database/migrations/013_horario_e_crm.sql
git commit -m "feat: Cria as colunas de horario da loja e as faltantes do CRM" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Consertar o CRM

**Files:**
- Modify: `src/services/crm/reactivation.ts`
- Modify: `src/services/ifood/ifood-api.ts`
- Create: `src/services/crm/crm-repo.test.ts`

**Interfaces:**
- Consumes: colunas da Task 1
- Produces: `upsertCustomerInCRM` funcionando de fato; assinatura mantida menos os campos de endereço:
  `upsertCustomerInCRM(params: { restauranteId: string; telefoneWhatsApp: string; nome?: string }): Promise<{ id: string; telefone_whatsapp: string; nome: string | null } | null>`

**Por que esta tarefa existe:** `clientes_crm` está vazia em produção depois de conversas reais. Duas causas empilhadas, cada uma suficiente sozinha — o arquivo usa o cliente **anon** (a RLS bloqueia todo insert, porque o webhook não tem JWT de usuário) e insere colunas que não existiam. E como **nenhuma das cinco consultas verifica o `error`**, a falha era engolida e o webhook seguia como se tivesse dado certo.

- [ ] **Step 1: Escrever o teste que prova o conserto**

Criar `src/services/crm/crm-repo.test.ts`. Este teste escreve no Supabase **real**, então segue a regra do projeto: fixture com id próprio, apagada no `afterAll` mesmo em caso de falha, com o `error` da limpeza verificado.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import { upsertCustomerInCRM } from './reactivation.js';

const restauranteId = randomUUID();
const telefone = `5516${Date.now().toString().slice(-9)}`;

beforeAll(async () => {
  const { error } = await supabaseAdmin.from('restaurantes').insert({
    id: restauranteId,
    nome: 'Fixture CRM',
  });
  if (error) throw error;
});

afterAll(async () => {
  const { error } = await supabaseAdmin.from('restaurantes').delete().eq('id', restauranteId);
  if (error) console.error('[Fixture] Falha ao limpar:', error.message);
});

describe('upsertCustomerInCRM', () => {
  // Este e o teste que teria pegado o defeito no dia zero: a funcao
  // devolvia undefined em silencio e ninguem soube que o CRM estava
  // vazio ate alguem olhar a tela.
  it('cria o contato na base quando o cliente escreve pela primeira vez', async () => {
    const criado = await upsertCustomerInCRM({ restauranteId, telefoneWhatsApp: telefone });

    expect(criado).not.toBeNull();
    expect(criado!.telefone_whatsapp).toBe(telefone);

    const { data, error } = await supabaseAdmin
      .from('clientes_crm')
      .select('id, telefone_whatsapp, estagio_pipeline')
      .eq('restaurante_id', restauranteId)
      .eq('telefone_whatsapp', telefone)
      .maybeSingle();

    if (error) throw error;
    expect(data).not.toBeNull();
    expect(data!.estagio_pipeline).toBe('novo_contato');
  });

  it('nao duplica o contato quando o mesmo cliente escreve de novo', async () => {
    await upsertCustomerInCRM({ restauranteId, telefoneWhatsApp: telefone });

    const { data, error } = await supabaseAdmin
      .from('clientes_crm')
      .select('id')
      .eq('restaurante_id', restauranteId)
      .eq('telefone_whatsapp', telefone);

    if (error) throw error;
    expect(data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/crm/crm-repo.test.ts`
Esperado: FAIL. O primeiro teste falha porque `upsertCustomerInCRM` devolve `undefined` — exatamente o defeito em produção.

- [ ] **Step 3: Corrigir `reactivation.ts`**

Três mudanças no arquivo:

1. **Trocar o import** de `supabase` por `supabaseAdmin` (`import { supabaseAdmin } from '../../config/supabase.js';`) e substituir **todas** as ocorrências. O cliente anon é bloqueado pela RLS porque o webhook roda sem JWT de usuário.
2. **Verificar o `error` em todas as cinco consultas.** Nas leituras, propagar; nas escritas, lançar. Nenhum `{ data }` sozinho pode sobrar no arquivo.
3. **Alinhar com o schema real.** Remover de `upsertCustomerInCRM` os campos `logradouro`, `numero`, `bairro`, `cidade` e `complemento` — não existem na tabela e nada os popula. Remover também da interface `UpsertCustomerParams`. Manter `opt_in_marketing`, `estagio_pipeline`, `ultima_mensagem_em` e `updated_at`, que a Task 1 garantiu existirem.

Em `addLoyaltyPoints`, verificar o `error` das duas consultas. A coluna `pontos_fidelidade` agora existe.

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/crm/crm-repo.test.ts`
Esperado: PASS, 2 testes.

- [ ] **Step 5: Corrigir `ifood-api.ts`**

Mesmo defeito latente: trocar o cliente anon por `supabaseAdmin` e verificar o `error` em toda consulta. **Não mexer em mais nada** — a integração está fora de uso e não é escopo deste ciclo.

- [ ] **Step 6: Rodar tudo e commitar**

Rodar: `npm test` e `npx tsc --noEmit`

```bash
git add src/services/crm/ src/services/ifood/ifood-api.ts
git commit -m "fix: Faz o CRM gravar de fato os contatos que conversam" -m "reactivation.ts usava o cliente anon, bloqueado pela RLS porque o webhook nao tem JWT de usuario, e inseria colunas inexistentes. Como nenhuma consulta verificava o error, a falha era engolida e clientes_crm ficou vazia desde sempre." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Função pura de horário de funcionamento

**Files:**
- Create: `src/services/restaurante/horario.ts`
- Create: `src/services/restaurante/horario.test.ts`

**Interfaces:**
- Consumes: a coluna `horario_funcionamento` da Task 1
- Produces:
  - `type Faixa = { abre: string; fecha: string }`
  - `type HorarioSemana = Partial<Record<'dom'|'seg'|'ter'|'qua'|'qui'|'sex'|'sab', Faixa[]>>`
  - `type EstadoLoja = { aberta: boolean; proximaAberturaEm: string | null }`
  - `calcularEstadoDaLoja(horario: HorarioSemana | null, fuso: string, agora?: Date): EstadoLoja`

- [ ] **Step 1: Escrever o teste**

Criar `src/services/restaurante/horario.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcularEstadoDaLoja } from './horario.js';

const FUSO = 'America/Sao_Paulo';

// Horario tipico de delivery: almoco e jantar, com intervalo, e domingo fechado.
const PADRAO = {
  seg: [{ abre: '11:00', fecha: '14:00' }, { abre: '18:00', fecha: '23:00' }],
  ter: [{ abre: '11:00', fecha: '14:00' }, { abre: '18:00', fecha: '23:00' }],
  qua: [{ abre: '11:00', fecha: '14:00' }, { abre: '18:00', fecha: '23:00' }],
  qui: [{ abre: '11:00', fecha: '14:00' }, { abre: '18:00', fecha: '23:00' }],
  sex: [{ abre: '11:00', fecha: '14:00' }, { abre: '18:00', fecha: '23:00' }],
  sab: [{ abre: '18:00', fecha: '23:00' }],
  dom: [],
};

// 2026-08-10 e uma segunda-feira. Os horarios abaixo sao em UTC;
// America/Sao_Paulo e UTC-3.
describe('calcularEstadoDaLoja', () => {
  it('esta aberta no meio do almoco', () => {
    const r = calcularEstadoDaLoja(PADRAO, FUSO, new Date('2026-08-10T15:00:00Z')); // 12h local
    expect(r.aberta).toBe(true);
  });

  // O intervalo entre almoco e jantar e o caso que uma faixa unica por dia
  // nao cobriria: a IA diria "estamos abertos" com a cozinha parada.
  it('esta fechada no intervalo entre almoco e jantar', () => {
    const r = calcularEstadoDaLoja(PADRAO, FUSO, new Date('2026-08-10T19:00:00Z')); // 16h local
    expect(r.aberta).toBe(false);
  });

  it('esta aberta no jantar', () => {
    const r = calcularEstadoDaLoja(PADRAO, FUSO, new Date('2026-08-10T23:00:00Z')); // 20h local
    expect(r.aberta).toBe(true);
  });

  it('esta fechada de madrugada', () => {
    const r = calcularEstadoDaLoja(PADRAO, FUSO, new Date('2026-08-10T06:00:00Z')); // 3h local
    expect(r.aberta).toBe(false);
  });

  // Dia com lista vazia significa fechado o dia inteiro.
  it('esta fechada no domingo', () => {
    const r = calcularEstadoDaLoja(PADRAO, FUSO, new Date('2026-08-09T15:00:00Z')); // domingo 12h
    expect(r.aberta).toBe(false);
  });

  it('informa o proximo horario de abertura quando fechada', () => {
    const r = calcularEstadoDaLoja(PADRAO, FUSO, new Date('2026-08-10T19:00:00Z')); // 16h local
    expect(r.aberta).toBe(false);
    expect(r.proximaAberturaEm).toBe('18:00');
  });

  // Sem horario configurado a loja e tratada como ABERTA, para nao quebrar
  // o atendimento de quem ainda nao preencheu a tela de configuracoes.
  it('trata horario nao configurado como aberta', () => {
    const r = calcularEstadoDaLoja(null, FUSO, new Date('2026-08-10T06:00:00Z'));
    expect(r.aberta).toBe(true);
  });

  // O servidor roda em Oregon; sem respeitar o fuso, o calculo erraria por horas.
  it('respeita o fuso do restaurante', () => {
    const r = calcularEstadoDaLoja(PADRAO, FUSO, new Date('2026-08-10T14:30:00Z')); // 11h30 local
    expect(r.aberta).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/restaurante/horario.test.ts`
Esperado: FAIL — `Failed to resolve import "./horario.js"`.

- [ ] **Step 3: Implementar**

Criar `src/services/restaurante/horario.ts`. A função converte o instante para o fuso do restaurante com `Intl.DateTimeFormat` (sem dependência nova), descobre o dia da semana e os minutos desde a meia-noite locais, e compara com as faixas do dia.

Regras que o comportamento precisa respeitar, e que os testes cobrem:

- Horário nulo ou objeto vazio → **aberta**. Restaurante que ainda não configurou não pode ficar sem atendimento.
- Dia com lista vazia → fechada o dia inteiro.
- `proximaAberturaEm` devolve o `abre` da próxima faixa do mesmo dia; se não houver, o primeiro `abre` do próximo dia com faixas. Formato `HH:MM`, string, para entrar direto no prompt.
- Comparação inclusiva no `abre` e exclusiva no `fecha`: às 23:00 em ponto a loja já fechou.

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/restaurante/horario.test.ts`
Esperado: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/restaurante/
git commit -m "feat: Cria o calculo de horario de funcionamento da loja" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: A IA para de inventar

**Files:**
- Modify: `src/services/ai/openai-agent.ts`
- Modify: `src/server.ts` (avaliação do horário antes do consumo de créditos)

**Interfaces:**
- Consumes: `calcularEstadoDaLoja` (Task 3), colunas da Task 1
- Produces: `processCustomerMessageWithAI` passa a receber `estadoLoja: EstadoLoja` nos parâmetros

**Por que esta tarefa existe:** a IA respondeu **"Nós entregamos até as 22h!"** a um cliente real. A regra atual do prompt diz *"JAMAIS INVENTE PREÇOS OU PRODUTOS"* — não cobre horário, prazo, taxa, bairro nem promoção, e foi por essa fresta que passou.

- [ ] **Step 1: Levar os dados reais ao prompt**

Em `openai-agent.ts`, o `systemPrompt` passa a incluir, a partir do registro do restaurante que já é carregado ali:

- **Taxa de entrega** (`taxa_entrega_padrao`) — hoje existe no banco com padrão de R$ 5,00 e **nunca chegou ao prompt**; é o mesmo defeito do horário, com o dado já configurado.
- **Pedido mínimo** (`pedido_minimo`), quando preenchido.
- **Informações adicionais** (`informacoes_adicionais`), como bloco de texto.
- **Estado da loja**: aberta ou fechada, e o próximo horário de abertura quando fechada.

- [ ] **Step 2: Alargar a regra anti-invenção**

Substituir a regra 3 atual por uma regra geral. O texto precisa deixar explícito que a restrição vale para **qualquer informação**, não só preço e produto, e dar à IA a saída honesta:

> Você só pode afirmar o que está no cardápio, nos dados da loja acima ou nas informações adicionais. Para qualquer outra pergunta — prazo de entrega, bairros atendidos, promoções, política de troca —, **não invente e não estime**. Diga que não tem essa informação e ofereça chamar alguém da loja. Exemplo: "Não tenho essa informação aqui, mas posso chamar alguém da loja pra te ajudar."

- [ ] **Step 3: Acrescentar as duas regras duras**

Como itens próprios, no mesmo nível das demais:

> **Nunca confirme pagamento.** Mesmo que o cliente envie comprovante e ele pareça válido, você não confirma recebimento. Diga que vai chamar alguém da loja para conferir. Só o lojista confirma pagamento.

> **Quando a loja estiver fechada, não anote pedido.** Informe que está fechada e quando abre. Você pode responder dúvidas normalmente, mas não registra pedido nem chama `finalizar_pedido`.

- [ ] **Step 4: Avaliar o horário no webhook, antes dos créditos**

Em `src/server.ts`, no mesmo ponto onde `decidirAtendimento` já barra conversa sob controle humano — **antes do bloco de consumo de créditos** —, carregar `horario_funcionamento` e `fuso_horario` do restaurante (o `SELECT` do restaurante já acontece ali; acrescentar as colunas) e chamar `calcularEstadoDaLoja`. O resultado é repassado a `processCustomerMessageWithAI`.

A loja fechada **não** interrompe o atendimento: a IA responde normalmente, sabendo que está fechada. O custo é 1 crédito, igual a qualquer texto.

- [ ] **Step 5: Rodar tudo e commitar**

Rodar: `npm test` e `npx tsc --noEmit`

```bash
git add src/services/ai/openai-agent.ts src/server.ts
git commit -m "feat: Faz a IA usar os dados reais da loja e parar de inventar" -m "A IA afirmou um horario de entrega que nao existia no sistema. A regra anti-invencao cobria so precos e produtos; agora cobre qualquer informacao, com saida honesta quando ela nao sabe." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Complementos no cardápio da IA

**Files:**
- Modify: `src/services/cardapio/cardapio-repo.ts`
- Modify: `src/services/cardapio/cardapio-para-ia.ts`
- Modify: `src/services/cardapio/cardapio-para-ia.test.ts`

**Interfaces:**
- Consumes: tabelas `complementos` e `produto_complementos` (já existem)
- Produces: `Produto` ganha `complementos: { id: string; nome: string; preco: number }[]`

**Por que esta tarefa existe:** as tabelas existem desde o início, mas `montarTextoDoCardapio` não as inclui — a IA não sabe que complementos existem e nunca os oferece. É o mesmo defeito da taxa de entrega: dado configurado que não chega ao prompt. Reduz o valor de cada pedido.

- [ ] **Step 1: Escrever o teste**

Acrescentar a `cardapio-para-ia.test.ts` — **sem alterar os testes existentes**:

```ts
it('inclui os complementos do produto com preco', () => {
  const comComplemento = [{
    id: 'c1', nome: 'Marmitas', ordem: 0,
    produtos: [{
      id: 'p1', categoriaId: 'c1', nome: 'Feijoada', descricao: null,
      preco: 26, disponivel: true, ordem: 0,
      complementos: [
        { id: 'x1', nome: 'Farofa extra', preco: 3 },
        { id: 'x2', nome: 'Couve extra', preco: 2.5 },
      ],
    }],
  }];

  const texto = montarTextoDoCardapio(comComplemento as any);
  expect(texto).toContain('Farofa extra');
  expect(texto).toContain('3,00');
  expect(texto).toContain('Couve extra');
});

// Produto sem complemento nao pode poluir o texto com secao vazia.
it('nao cria secao de complementos para produto que nao tem', () => {
  const semComplemento = [{
    id: 'c1', nome: 'Bebidas', ordem: 0,
    produtos: [{
      id: 'p1', categoriaId: 'c1', nome: 'Refrigerante', descricao: null,
      preco: 12, disponivel: true, ordem: 0, complementos: [],
    }],
  }];

  expect(montarTextoDoCardapio(semComplemento as any).toLowerCase()).not.toContain('complemento');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/cardapio/cardapio-para-ia.test.ts`
Esperado: FAIL nos dois testes novos; os 7 existentes continuam passando.

- [ ] **Step 3: Carregar os complementos no repositório**

Em `cardapio-repo.ts`, `listarCardapio` passa a buscar `produto_complementos` junto com `complementos`, numa consulta a mais **no total** (não uma por produto), e agrupa em memória — mesmo padrão que a função já usa para categorias e produtos. Filtrar `complementos` por `restaurante_id` explicitamente.

Verificar o `error` da consulta nova. O tipo `Produto` ganha o campo `complementos`.

- [ ] **Step 4: Incluir no texto da IA**

Em `cardapio-para-ia.ts`, cada produto com complementos ganha uma linha indentada abaixo dele, no mesmo formato de preço já usado (`R$ 3,00`). Produto sem complementos não gera nada.

Vale a mesma regra do cardápio: a IA só oferece complemento cadastrado, com o preço cadastrado.

- [ ] **Step 5: Rodar e ver passar**

Rodar: `npm test -- src/services/cardapio/cardapio-para-ia.test.ts`
Esperado: PASS, 9 testes.

- [ ] **Step 6: Commit**

```bash
git add src/services/cardapio/
git commit -m "feat: Leva os complementos do cardapio para o prompt da IA" -m "As tabelas existiam desde o inicio mas nunca chegavam ao prompt, entao a IA nunca oferecia complemento e o valor por pedido ficava menor." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Imagem, documento e localização no webhook

**Files:**
- Modify: `src/server.ts`
- Modify: `src/services/whatsapp/audio-storage.ts` (generalizar para mídia)
- Create: `src/services/conversas/tipo-mensagem.test.ts`

**Interfaces:**
- Consumes: `salvarAudioDaMeta` (a generalizar), `gravarMensagem` (existente)
- Produces: `classificarTipoMensagem(messageType: string): 'texto' | 'audio' | 'imagem' | 'documento' | 'localizacao' | 'nao_suportado'`

**Por que esta tarefa existe:** hoje imagem, documento, vídeo, figurinha e localização caem no ramo genérico e são gravadas como `tipo: 'texto'` com texto nulo. O cliente manda o comprovante de PIX e o lojista vê **uma linha em branco**. E localização é o jeito mais comum de informar endereço em delivery — hoje a IA responde como se o cliente não tivesse dito nada.

- [ ] **Step 1: Escrever o teste da classificação**

Criar `src/services/conversas/tipo-mensagem.test.ts` cobrindo: `text` vira `texto`; `audio` vira `audio`; `image` vira `imagem`; `document` vira `documento`; `location` vira `localizacao`; e `sticker`, `video` e qualquer valor desconhecido viram `nao_suportado`.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/conversas/tipo-mensagem.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a classificação**

Função pura, sem I/O, no padrão de `janela.ts` e `fluxo-webhook.ts`.

- [ ] **Step 4: Generalizar o armazenamento de mídia**

`audio-storage.ts` já baixa da Meta e guarda no bucket privado, devolvendo `{ caminho, buffer }`. Generalizar para aceitar a extensão e o `contentType` como parâmetros, mantendo o comportamento de falha que a Task 3 do ciclo 3 estabeleceu: **falha no Storage ainda devolve o buffer**, porque perder o arquivo não pode impedir o atendimento.

- [ ] **Step 5: Tratar os tipos novos no webhook**

Em `src/server.ts`:

- **Imagem** — baixa, guarda, grava com `tipo: 'imagem'`. Custa **3 créditos**. A imagem é enviada à IA para classificação.
- **Documento** — baixa, guarda, grava com `tipo: 'documento'`. Custa 1 crédito; não vai para a IA.
- **Localização** — não tem arquivo. Grava `tipo: 'localizacao'` com as coordenadas no campo de texto, num formato legível, mais o endereço quando a Meta o envia. Custa 1 crédito. O conteúdo vai para a IA como texto, para servir de endereço de entrega.
- **Não suportado** — grava com o tipo real no texto (ex.: "Figurinha recebida"), para o lojista ver que algo chegou em vez de uma linha vazia. Não vai para a IA e não consome crédito de IA.

- [ ] **Step 6: Rodar tudo e commitar**

Rodar: `npm test` e `npx tsc --noEmit`

```bash
git add src/services/conversas/ src/services/whatsapp/ src/server.ts
git commit -m "feat: Trata imagem, documento e localizacao como tipos de primeira classe" -m "Antes, tudo que nao fosse texto ou audio virava linha em branco na caixa de entrada: o comprovante de PIX sumia sem deixar rastro e a localizacao nao chegava a IA." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: A caixa de entrada mostra os tipos novos

**Files:**
- Modify: `frontend/src/components/app/Conversa.tsx`
- Create: `frontend/src/components/app/Conversa.test.tsx`

**Interfaces:**
- Consumes: as mensagens com os tipos da Task 6

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/components/app/Conversa.test.tsx` cobrindo: mensagem de imagem exibe a imagem com URL assinada; documento exibe o rótulo com nome do arquivo e link; localização exibe as coordenadas com link para o mapa; tipo não suportado exibe o rótulo honesto em vez de vazio; e áudio continua com `<audio controls>` e transcrição — que hoje **não tem teste nenhum**, lacuna herdada do ciclo 3.

Usar `vi.stubGlobal('fetch', ...)` no padrão dos testes existentes.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm --prefix frontend test -- src/components/app/Conversa.test.tsx`

- [ ] **Step 3: Implementar**

Seguir o padrão visual já estabelecido no componente, com a paleta `brand-*`/`ink-*`/`stone-*`. Imagem com `max-width` para não estourar a coluna em tela pequena — o lojista abre isso no celular.

- [ ] **Step 4: Rodar, buildar e commitar**

Rodar: `npm --prefix frontend test` e `npm --prefix frontend run build`

```bash
git add frontend/src/components/app/
git commit -m "feat: Exibe imagem, documento e localizacao na caixa de entrada" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Tela de horário e informações da loja

**Files:**
- Modify: `frontend/src/pages/app/Configuracoes.tsx`
- Create: `frontend/src/pages/app/Configuracoes.test.tsx`
- Modify: `src/server.ts` (rotas de leitura e gravação)

**Interfaces:**
- Consumes: colunas da Task 1
- Rotas: `GET /api/restaurante/configuracoes`, `PUT /api/restaurante/configuracoes`, com `autenticar` e `exigirAssinaturaAtiva`, filtrando por `req.restauranteId`

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/pages/app/Configuracoes.test.tsx` cobrindo: a tela carrega o horário salvo; marcar um dia como fechado remove as faixas dele; **"copiar para todos os dias"** replica a configuração do dia escolhido; salvar chama `PUT` com o JSON no formato certo; horário inválido (fecha antes de abre) é recusado antes de chamar a API, com mensagem em português.

Esta tela **não tinha teste nenhum** — é a única que lida com um segredo (o token da Meta), lacuna registrada na revisão final do ciclo 3.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm --prefix frontend test -- src/pages/app/Configuracoes.test.tsx`

- [ ] **Step 3: Acrescentar as rotas no backend**

`GET` devolve horário, fuso, taxa, pedido mínimo e informações adicionais. **Nunca devolve o token**, seguindo a regra que `estadoDaConexao` já respeita. `PUT` valida o formato do JSON de horário antes de gravar e recusa com 400 e mensagem em português se estiver malformado.

- [ ] **Step 4: Implementar as duas seções da tela**

Abaixo da conexão do WhatsApp que já existe:

- **Horário de funcionamento** — sete linhas, cada uma com interruptor de aberto/fechado e os pares de horário. Botão **"copiar para todos os dias"**, porque a maioria dos restaurantes repete de segunda a sexta e ninguém preenche sete vezes sem reclamar.
- **Informações da loja** — taxa de entrega, pedido mínimo, e o campo livre com texto de ajuda dizendo o que faz sentido colocar ali ("prazo de entrega, bairros atendidos, formas de pagamento...").

- [ ] **Step 5: Rodar tudo e commitar**

Rodar: `npm test`, `npx tsc --noEmit`, `npm --prefix frontend test`, `npm --prefix frontend run build`

```bash
git add frontend/src/pages/app/Configuracoes.tsx frontend/src/pages/app/Configuracoes.test.tsx src/server.ts
git commit -m "feat: Cria a tela de horario de funcionamento e informacoes da loja" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Campanha de reativação com template

**Files:**
- Modify: `src/services/crm/reactivation.ts`
- Create: `src/services/crm/reativacao.test.ts`

**Interfaces:**
- Consumes: `opt_in_marketing` (Task 1), o CRM funcionando (Task 2)
- Produces: `runReactivationCampaign(restauranteId: string, diasAusente?: number): Promise<{ disparados: number; mensagem: string }>` — assinatura mantida, comportamento corrigido

**Por que esta tarefa existe:** a função envia **texto livre**. Reativação é, por definição, para cliente ausente há 15 ou 30 dias — ou seja, **sempre fora da janela de 24 horas da Meta**. Todas as mensagens seriam recusadas. A função nunca poderia ter funcionado.

- [ ] **Step 1: Escrever o teste**

Criar `src/services/crm/reativacao.test.ts`, com a Meta mockada, cobrindo: cliente ausente há mais dias que o corte entra na campanha; cliente com `opt_in_marketing` falso **não** entra; a chamada à Meta usa **template**, não texto livre; e falha no envio a um cliente não interrompe os demais.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/crm/reativacao.test.ts`

- [ ] **Step 3: Trocar texto livre por template**

A função passa a enviar o template `reativacao_cupom`, já submetido à Meta, com as variáveis `customer_name` e `coupon_code`. Isso exige uma função de envio de template no cliente da Meta — `meta-cloud-api.ts` hoje só tem texto e áudio.

**O cupom e o texto saem do código.** Hoje `VOLTEI10` e a mensagem inteira estão escritos ali; o cupom passa a ser parâmetro da campanha.

Verificar o `error` de todas as consultas, como na Task 2.

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/crm/reativacao.test.ts`

- [ ] **Step 5: Rodar tudo e commitar**

Rodar: `npm test` e `npx tsc --noEmit`

```bash
git add src/services/crm/ src/services/whatsapp/meta-cloud-api.ts
git commit -m "fix: Faz a campanha de reativacao usar template aprovado" -m "Ela enviava texto livre para cliente ausente ha 15 ou 30 dias, que esta sempre fora da janela de 24h da Meta: todas as mensagens seriam recusadas." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Pendências do dono durante o ciclo

- **Aplicar a migration 013** no Supabase (Task 1). Nada depois dela funciona sem isso.
- **Preencher o horário de funcionamento** do restaurante real assim que a Task 8 estiver no ar. Enquanto estiver vazio, a loja é tratada como sempre aberta — comportamento deliberado, para não derrubar quem ainda não configurou.
- **Aprovação do template `reativacao_cupom`** pela Meta, necessária para a Task 9 funcionar de verdade em produção (o código e os testes não dependem dela).
