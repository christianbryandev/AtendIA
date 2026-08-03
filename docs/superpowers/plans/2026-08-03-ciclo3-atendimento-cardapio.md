# Ciclo 3 — Atendimento, Cardápio e Conta: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um restaurante real ser atendido pela IA no WhatsApp, com o lojista supervisionando e podendo assumir a conversa, e a plataforma vendável para outros restaurantes.

**Architecture:** Toda mensagem que entra ou sai passa a ser gravada em `mensagens`, com o estado de cada atendimento em `conversas`. Essa fundação serve a três coisas ao mesmo tempo: dá memória à IA (que hoje responde cada mensagem isoladamente), alimenta a caixa de entrada, e guarda o marco da janela de 24 horas da Meta. O painel lê as mensagens em tempo real direto do Supabase, mas todo envio continua passando pela nossa API, para nenhuma mensagem escapar das checagens de janela, crédito e token.

**Tech Stack:** Node + Express + TypeScript (backend), Supabase/Postgres + Supabase Realtime + Supabase Storage, WhatsApp Cloud API, OpenAI e Groq, Resend, React 19 + Vite + React Router 7 + Tailwind (frontend), Vitest nos dois lados.

**Spec:** `docs/superpowers/specs/2026-08-03-ciclo3-atendimento-cardapio-design.md`

## Global Constraints

- **Todo texto visível ao usuário e todo comentário de código em português brasileiro.**
- **Commits em português,** padrão `tipo: Descrição no imperativo`, sem acentos no título, com rodapé `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Imports em `src/` usam extensão `.js`** (ESM); o projeto tem `"type": "module"`.
- **Toda query com `supabaseAdmin` (service_role) faz bypass de RLS.** Filtrar por `restaurante_id` explicitamente, sempre.
- **`supabaseAdmin.rpc()` devolve `{ data, error }` e NÃO lança** — verificar o `error` em toda chamada.
- **Migrations idempotentes** (`IF NOT EXISTS`, `CREATE OR REPLACE`), seguindo o padrão da `006`.
- **Funções novas no banco:** `SECURITY DEFINER`, `SET search_path = public, pg_temp`, guard de role no corpo, e o par `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role`. A migration `005` fechou uma vulnerabilidade real de crédito ilimitado por PostgREST; um `REVOKE` esquecido a reabre.
- **Token da Meta sempre criptografado** com `encrypt`/`decrypt` de `src/utils/crypto.ts`. Nunca em texto puro.
- **Senha sempre com bcrypt.** Nunca escrever em `restaurantes.email_acesso` nem `restaurantes.senha_acesso`, que são colunas resquício.
- **JWT:** `sub = restaurante_id`, `role: 'authenticated'`, `aud: 'authenticated'`, mais `user_metadata`. É o formato que as policies de RLS esperam — não alterar.
- **Custo em créditos:** texto = 1, áudio = 8. Cota mensal de 10.000.
- **Janela da Meta:** 24 horas desde a última mensagem **do cliente**. Fora dela, só template aprovado — e não há template aprovado ainda.
- **A suíte inclui `src/database/creditos.test.ts`**, que escreve no Supabase REAL criando e apagando fixtures. Não alterar esse arquivo. Testes novos que toquem o banco real devem criar fixtures com id próprio e apagá-las mesmo em caso de falha.

## File Structure

**Backend — criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/database/migrations/009_mensagens_conversas.sql` | Tabelas `mensagens` e `conversas`, RLS, índices |
| `src/services/conversas/mensagem-repo.ts` | Gravar e ler mensagens. Único módulo que escreve em `mensagens` |
| `src/services/conversas/conversa-repo.ts` | Estado do atendimento: janela de 24h e controle humano |
| `src/services/conversas/janela.ts` | Cálculo da janela de 24 horas, função pura |
| `src/services/whatsapp/audio-storage.ts` | Baixa o áudio da Meta e guarda no Supabase Storage |
| `src/services/cardapio/cardapio-repo.ts` | Leitura e escrita de categorias, produtos e complementos |
| `src/services/cardapio/cardapio-para-ia.ts` | Monta o texto do cardápio para o prompt |
| `src/services/whatsapp/conexao.ts` | Valida e grava a conexão do WhatsApp do restaurante |
| `src/services/email/resend-client.ts` | Cliente do Resend, único lugar que conhece a chave |
| `src/services/email/templates.ts` | Textos dos e-mails |
| `src/services/auth/recuperacao-senha.ts` | Token de recuperação: gerar, validar, consumir |
| `src/database/migrations/010_tokens_recuperacao.sql` | Tabela de tokens de recuperação |

**Backend — modificar:** `src/server.ts` (fluxo do webhook e rotas novas), `src/config/env.ts` (`RESEND_API_KEY`).

**Frontend — criar:**

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/components/app/MenuLateral.tsx` | Navegação do painel |
| `frontend/src/services/supabase.ts` | Cliente do Supabase para o Realtime |
| `frontend/src/pages/app/Atendimento.tsx` | Caixa de entrada |
| `frontend/src/components/app/ListaConversas.tsx` | Coluna da esquerda |
| `frontend/src/components/app/Conversa.tsx` | Coluna da direita |
| `frontend/src/components/app/CampoEnvio.tsx` | Campo de digitação e regra da janela |
| `frontend/src/pages/app/Cardapio.tsx` | Cadastro do cardápio |
| `frontend/src/pages/app/Configuracoes.tsx` | Conexão do WhatsApp |
| `frontend/src/pages/site/EsqueciSenha.tsx` | Pedido de recuperação |
| `frontend/src/pages/site/RedefinirSenha.tsx` | Nova senha pelo link |

**Frontend — modificar:** `App.tsx` (rotas), `PainelLayout.tsx` (menu lateral), `Login.tsx` (link de esqueci a senha).

**Ordem das tarefas:** 1 → 2 → 3 (fundação) → 4 → 5 (cardápio) → 6 (WhatsApp) → 7 → 8 → 9 (caixa de entrada) → 10 → 11 (senha) → 12 (menu). Ordenado por risco: se faltar tempo, o que fica de fora é o menos crítico.

---

## Task 1: Migration das tabelas de mensagens e conversas

**Files:**
- Create: `src/database/migrations/009_mensagens_conversas.sql`

**Interfaces:**
- Consumes: nada
- Produces: tabelas `mensagens` e `conversas` com RLS por tenant

- [ ] **Step 1: Escrever a migration**

Criar `src/database/migrations/009_mensagens_conversas.sql`:

```sql
-- ============================================================
-- 009_mensagens_conversas.sql
-- Ciclo 3: fundação do atendimento.
--
-- Hoje o webhook recebe a mensagem, manda para a IA, responde e
-- descarta. Nada é guardado. Isso impede três coisas ao mesmo tempo:
-- a caixa de entrada, a memória da IA (que responde cada mensagem
-- isoladamente) e o controle da janela de 24 horas da Meta.
--
-- Duas tabelas em vez de uma: a caixa de entrada precisa listar 50
-- conversas sem varrer 10 mil mensagens, e o webhook precisa saber se
-- a IA está pausada sem ler histórico nenhum.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    telefone_cliente VARCHAR(30) NOT NULL,

    -- Marco da janela de 24h da Meta. Só mensagem DO CLIENTE reabre a
    -- janela; resposta nossa não conta.
    ultima_mensagem_cliente_em TIMESTAMP WITH TIME ZONE,

    -- Ordena a lista da caixa de entrada.
    ultima_mensagem_em TIMESTAMP WITH TIME ZONE,

    sob_controle_humano BOOLEAN NOT NULL DEFAULT FALSE,
    controle_assumido_em TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (restaurante_id, telefone_cliente)
);

CREATE INDEX IF NOT EXISTS idx_conversas_lista
  ON conversas(restaurante_id, ultima_mensagem_em DESC);

CREATE TABLE IF NOT EXISTS mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    telefone_cliente VARCHAR(30) NOT NULL,

    direcao VARCHAR(10) NOT NULL CHECK (direcao IN ('recebida', 'enviada')),
    autor VARCHAR(10) NOT NULL CHECK (autor IN ('cliente', 'ia', 'lojista')),

    tipo VARCHAR(10) NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'audio')),
    texto TEXT,
    transcricao TEXT,
    audio_url TEXT,

    whatsapp_message_id VARCHAR(255),

    -- 'enviando' cobre o instante entre gravar e a Meta confirmar: a
    -- mensagem aparece na tela do lojista antes de sair de fato.
    status VARCHAR(15) NOT NULL DEFAULT 'ok'
      CHECK (status IN ('ok', 'enviando', 'falha')),
    erro_envio TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa
  ON mensagens(restaurante_id, telefone_cliente, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mensagens_whatsapp_id
  ON mensagens(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- Estas duas tabelas são as PRIMEIRAS que o navegador vai ler direto,
-- via Supabase Realtime, sem passar pela nossa API. A policy é a única
-- coisa impedindo um restaurante de ver a conversa de outro.
ALTER TABLE conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversas_isolation_policy ON conversas;
CREATE POLICY conversas_isolation_policy ON conversas
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

DROP POLICY IF EXISTS mensagens_isolation_policy ON mensagens;
CREATE POLICY mensagens_isolation_policy ON mensagens
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- Trigger de updated_at, idempotente. A função é criada
-- defensivamente porque um banco montado só pelas migrations não a tem.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversas_modtime ON conversas;
CREATE TRIGGER update_conversas_modtime
  BEFORE UPDATE ON conversas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- Publicação do Realtime
-- ------------------------------------------------------------
-- Sem isto o navegador assina o canal e nunca recebe nada.
ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE conversas;
```

- [ ] **Step 2: Aplicar no Supabase**

Rodar o conteúdo no SQL Editor. Esperado: `Success. No rows returned`.

Rodar uma segunda vez. Esperado: erro apenas nas duas linhas de `ALTER PUBLICATION` (o Postgres não aceita `IF NOT EXISTS` ali). Todo o resto passa. Se isso incomodar numa reaplicação, envolver as duas linhas num bloco `DO` que consulta `pg_publication_tables` antes.

- [ ] **Step 3: Conferir**

```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

Esperado: `mensagens` e `conversas` na lista.

- [ ] **Step 4: Commit**

```bash
git add src/database/migrations/009_mensagens_conversas.sql
git commit -m "feat: Cria as tabelas de mensagens e conversas" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Janela de 24 horas e repositórios de conversa

**Files:**
- Create: `src/services/conversas/janela.ts`
- Create: `src/services/conversas/janela.test.ts`
- Create: `src/services/conversas/conversa-repo.ts`
- Create: `src/services/conversas/mensagem-repo.ts`

**Interfaces:**
- Consumes: tabelas da Task 1
- Produces:
  - De `janela.js`: `type EstadoJanela = { aberta: boolean; expiraEm: Date | null; minutosRestantes: number }`; `calcularJanela(ultimaMensagemClienteEm: string | null, agora?: Date): EstadoJanela`
  - De `conversa-repo.js`: `type Conversa = { id: string; restauranteId: string; telefoneCliente: string; ultimaMensagemClienteEm: string | null; ultimaMensagemEm: string | null; sobControleHumano: boolean; controleAssumidoEm: string | null }`; `buscarConversa(restauranteId, telefone): Promise<Conversa | null>`; `registrarMensagemDoCliente(restauranteId, telefone, quando: string): Promise<void>`; `registrarMensagemNossa(restauranteId, telefone, quando: string): Promise<void>`; `definirControleHumano(restauranteId, telefone, humano: boolean): Promise<void>`; `listarConversas(restauranteId, limite?): Promise<Conversa[]>`
  - De `mensagem-repo.js`: `type NovaMensagem = { restauranteId: string; telefoneCliente: string; direcao: 'recebida' | 'enviada'; autor: 'cliente' | 'ia' | 'lojista'; tipo?: 'texto' | 'audio'; texto?: string | null; transcricao?: string | null; audioUrl?: string | null; whatsappMessageId?: string | null; status?: 'ok' | 'enviando' | 'falha' }`; `gravarMensagem(m: NovaMensagem): Promise<string>` (devolve o id); `marcarStatus(id: string, status: 'ok' | 'falha', erro?: string): Promise<void>`; `ultimasMensagens(restauranteId, telefone, limite: number): Promise<{ autor: string; texto: string | null; transcricao: string | null }[]>`

- [ ] **Step 1: Escrever o teste da janela**

Criar `src/services/conversas/janela.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcularJanela } from './janela.js';

const AGORA = new Date('2026-08-03T12:00:00.000Z');

describe('calcularJanela', () => {
  it('considera fechada quando o cliente nunca escreveu', () => {
    const r = calcularJanela(null, AGORA);
    expect(r.aberta).toBe(false);
    expect(r.minutosRestantes).toBe(0);
    expect(r.expiraEm).toBeNull();
  });

  it('considera aberta logo apos a mensagem do cliente', () => {
    const r = calcularJanela('2026-08-03T11:59:00.000Z', AGORA);
    expect(r.aberta).toBe(true);
    expect(r.minutosRestantes).toBe(24 * 60 - 1);
  });

  it('continua aberta faltando um minuto', () => {
    const r = calcularJanela('2026-08-02T12:01:00.000Z', AGORA);
    expect(r.aberta).toBe(true);
    expect(r.minutosRestantes).toBe(1);
  });

  // O limite e exatamente 24h: no instante em que completa, fecha.
  it('fecha exatamente em 24 horas', () => {
    const r = calcularJanela('2026-08-02T12:00:00.000Z', AGORA);
    expect(r.aberta).toBe(false);
    expect(r.minutosRestantes).toBe(0);
  });

  it('fica fechada muito depois', () => {
    const r = calcularJanela('2026-07-20T12:00:00.000Z', AGORA);
    expect(r.aberta).toBe(false);
  });

  it('informa quando a janela expira', () => {
    const r = calcularJanela('2026-08-03T09:00:00.000Z', AGORA);
    expect(r.expiraEm?.toISOString()).toBe('2026-08-04T09:00:00.000Z');
  });

  // Data invalida vinda do banco nao pode liberar envio por acidente.
  it('trata data invalida como fechada', () => {
    const r = calcularJanela('nao e uma data', AGORA);
    expect(r.aberta).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/conversas/janela.test.ts`
Esperado: FAIL — `Failed to resolve import "./janela.js"`.

- [ ] **Step 3: Implementar a janela**

Criar `src/services/conversas/janela.ts`:

```ts
/**
 * Janela de atendimento da Meta.
 *
 * A API do WhatsApp só aceita mensagem de texto livre até 24 horas
 * depois da última mensagem DO CLIENTE. Resposta nossa não reabre nada.
 * Passado esse prazo, só template aprovado — e ainda não temos nenhum.
 *
 * Vale igual para a IA e para o lojista. Na prática a IA quase nunca
 * esbarra nisso, porque responde em segundos; quem esbarra é o humano
 * que volta na conversa horas depois.
 */

const JANELA_MS = 24 * 60 * 60 * 1000;

export interface EstadoJanela {
  aberta: boolean;
  expiraEm: Date | null;
  minutosRestantes: number;
}

const FECHADA: EstadoJanela = { aberta: false, expiraEm: null, minutosRestantes: 0 };

export function calcularJanela(
  ultimaMensagemClienteEm: string | null,
  agora: Date = new Date(),
): EstadoJanela {
  if (!ultimaMensagemClienteEm) return FECHADA;

  const inicio = new Date(ultimaMensagemClienteEm);
  if (Number.isNaN(inicio.getTime())) return FECHADA;

  const expiraEm = new Date(inicio.getTime() + JANELA_MS);
  const restanteMs = expiraEm.getTime() - agora.getTime();

  if (restanteMs <= 0) {
    return { aberta: false, expiraEm, minutosRestantes: 0 };
  }

  return {
    aberta: true,
    expiraEm,
    minutosRestantes: Math.floor(restanteMs / 60_000),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/conversas/janela.test.ts`
Esperado: PASS, 7 testes.

- [ ] **Step 5: Implementar o repositório de conversas**

Criar `src/services/conversas/conversa-repo.ts`:

```ts
import { supabaseAdmin } from '../../config/supabase.js';

export interface Conversa {
  id: string;
  restauranteId: string;
  telefoneCliente: string;
  ultimaMensagemClienteEm: string | null;
  ultimaMensagemEm: string | null;
  sobControleHumano: boolean;
  controleAssumidoEm: string | null;
}

interface LinhaConversa {
  id: string;
  restaurante_id: string;
  telefone_cliente: string;
  ultima_mensagem_cliente_em: string | null;
  ultima_mensagem_em: string | null;
  sob_controle_humano: boolean;
  controle_assumido_em: string | null;
}

const COLUNAS =
  'id, restaurante_id, telefone_cliente, ultima_mensagem_cliente_em, ultima_mensagem_em, sob_controle_humano, controle_assumido_em';

function paraDominio(l: LinhaConversa): Conversa {
  return {
    id: l.id,
    restauranteId: l.restaurante_id,
    telefoneCliente: l.telefone_cliente,
    ultimaMensagemClienteEm: l.ultima_mensagem_cliente_em,
    ultimaMensagemEm: l.ultima_mensagem_em,
    sobControleHumano: l.sob_controle_humano,
    controleAssumidoEm: l.controle_assumido_em,
  };
}

export async function buscarConversa(
  restauranteId: string,
  telefone: string,
): Promise<Conversa | null> {
  const { data } = await supabaseAdmin
    .from('conversas')
    .select(COLUNAS)
    .eq('restaurante_id', restauranteId)
    .eq('telefone_cliente', telefone)
    .maybeSingle();

  return data ? paraDominio(data as LinhaConversa) : null;
}

/**
 * Mensagem do cliente: reabre a janela de 24h e sobe a conversa na lista.
 */
export async function registrarMensagemDoCliente(
  restauranteId: string,
  telefone: string,
  quando: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('conversas')
    .upsert(
      {
        restaurante_id: restauranteId,
        telefone_cliente: telefone,
        ultima_mensagem_cliente_em: quando,
        ultima_mensagem_em: quando,
      },
      { onConflict: 'restaurante_id,telefone_cliente' },
    );

  if (error) throw error;
}

/**
 * Mensagem nossa (IA ou lojista): sobe na lista mas NÃO reabre a janela.
 */
export async function registrarMensagemNossa(
  restauranteId: string,
  telefone: string,
  quando: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('conversas')
    .update({ ultima_mensagem_em: quando })
    .eq('restaurante_id', restauranteId)
    .eq('telefone_cliente', telefone);

  if (error) throw error;
}

export async function definirControleHumano(
  restauranteId: string,
  telefone: string,
  humano: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('conversas')
    .update({
      sob_controle_humano: humano,
      controle_assumido_em: humano ? new Date().toISOString() : null,
    })
    .eq('restaurante_id', restauranteId)
    .eq('telefone_cliente', telefone);

  if (error) throw error;
}

export async function listarConversas(
  restauranteId: string,
  limite = 50,
): Promise<Conversa[]> {
  const { data } = await supabaseAdmin
    .from('conversas')
    .select(COLUNAS)
    .eq('restaurante_id', restauranteId)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .limit(limite);

  return (data ?? []).map((l) => paraDominio(l as LinhaConversa));
}
```

- [ ] **Step 6: Implementar o repositório de mensagens**

Criar `src/services/conversas/mensagem-repo.ts`:

```ts
import { supabaseAdmin } from '../../config/supabase.js';

export interface NovaMensagem {
  restauranteId: string;
  telefoneCliente: string;
  direcao: 'recebida' | 'enviada';
  autor: 'cliente' | 'ia' | 'lojista';
  tipo?: 'texto' | 'audio';
  texto?: string | null;
  transcricao?: string | null;
  audioUrl?: string | null;
  whatsappMessageId?: string | null;
  status?: 'ok' | 'enviando' | 'falha';
}

export async function gravarMensagem(m: NovaMensagem): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('mensagens')
    .insert([{
      restaurante_id: m.restauranteId,
      telefone_cliente: m.telefoneCliente,
      direcao: m.direcao,
      autor: m.autor,
      tipo: m.tipo ?? 'texto',
      texto: m.texto ?? null,
      transcricao: m.transcricao ?? null,
      audio_url: m.audioUrl ?? null,
      whatsapp_message_id: m.whatsappMessageId ?? null,
      status: m.status ?? 'ok',
    }])
    .select('id')
    .single();

  if (error) throw error;
  return data!.id as string;
}

export async function marcarStatus(
  id: string,
  status: 'ok' | 'falha',
  erro?: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('mensagens')
    .update({ status, erro_envio: erro ?? null })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Últimas mensagens da conversa, da mais antiga para a mais recente —
 * que é a ordem que o modelo espera receber como histórico.
 */
export async function ultimasMensagens(
  restauranteId: string,
  telefone: string,
  limite: number,
): Promise<{ autor: string; texto: string | null; transcricao: string | null }[]> {
  const { data } = await supabaseAdmin
    .from('mensagens')
    .select('autor, texto, transcricao, created_at')
    .eq('restaurante_id', restauranteId)
    .eq('telefone_cliente', telefone)
    .order('created_at', { ascending: false })
    .limit(limite);

  return (data ?? []).reverse().map((m: any) => ({
    autor: m.autor,
    texto: m.texto,
    transcricao: m.transcricao,
  }));
}
```

- [ ] **Step 7: Rodar tudo e commitar**

Rodar: `npm test` e `npx tsc --noEmit`
Esperado: PASS, sem erros de tipo.

```bash
git add src/services/conversas/
git commit -m "feat: Cria a fundacao de mensagens, conversas e janela de 24h" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Webhook grava tudo e a IA ganha memória

**Files:**
- Create: `src/services/whatsapp/audio-storage.ts`
- Modify: `src/server.ts` (fluxo do webhook do WhatsApp)
- Create: `src/services/conversas/fluxo-webhook.test.ts`

**Interfaces:**
- Consumes: `gravarMensagem`, `ultimasMensagens` (Task 2); `buscarConversa`, `registrarMensagemDoCliente`, `registrarMensagemNossa`, `definirControleHumano` (Task 2)
- Produces: `salvarAudioDaMeta(mediaId: string, token: string, restauranteId: string): Promise<string | null>` de `audio-storage.js` (devolve a URL guardada, ou `null` se o download falhar); `deveDevolverControle(controleAssumidoEm: string | null, ultimaMensagemEm: string | null, agora?: Date): boolean` de `fluxo-webhook.js`

- [ ] **Step 1: Escrever o teste da devolução automática de controle**

Criar `src/services/conversas/fluxo-webhook.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deveDevolverControle } from './fluxo-webhook.js';

const AGORA = new Date('2026-08-03T12:00:00.000Z');

describe('deveDevolverControle', () => {
  it('nao devolve quando ninguem assumiu', () => {
    expect(deveDevolverControle(null, '2026-08-03T10:00:00.000Z', AGORA)).toBe(false);
  });

  it('nao devolve com conversa ativa ha pouco', () => {
    expect(deveDevolverControle('2026-08-03T11:00:00.000Z', '2026-08-03T11:50:00.000Z', AGORA)).toBe(false);
  });

  it('devolve apos 30 minutos sem mensagem nova', () => {
    expect(deveDevolverControle('2026-08-03T10:00:00.000Z', '2026-08-03T11:20:00.000Z', AGORA)).toBe(true);
  });

  // O limite e exatamente 30 minutos.
  it('devolve exatamente em 30 minutos', () => {
    expect(deveDevolverControle('2026-08-03T10:00:00.000Z', '2026-08-03T11:30:00.000Z', AGORA)).toBe(true);
  });

  // Sem mensagem nenhuma na conversa, o marco e o momento em que o
  // lojista assumiu — senao o controle ficaria preso para sempre.
  it('usa o momento em que assumiu quando nao ha mensagem posterior', () => {
    expect(deveDevolverControle('2026-08-03T11:00:00.000Z', null, AGORA)).toBe(true);
    expect(deveDevolverControle('2026-08-03T11:45:00.000Z', null, AGORA)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/conversas/fluxo-webhook.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a regra**

Criar `src/services/conversas/fluxo-webhook.ts`:

```ts
const OCIOSIDADE_MS = 30 * 60 * 1000;

/**
 * Decide se o controle volta para a IA.
 *
 * Avaliado preguiçosamente, na chegada da próxima mensagem do cliente,
 * em vez de por trabalho agendado. O Render cobra à parte por cron, e um
 * agendador varrendo conversas de minuto em minuto gastaria recurso o
 * tempo todo para agir raramente. O efeito é o mesmo: a única coisa que
 * a devolução precisa destravar é o atendimento da próxima mensagem.
 */
export function deveDevolverControle(
  controleAssumidoEm: string | null,
  ultimaMensagemEm: string | null,
  agora: Date = new Date(),
): boolean {
  if (!controleAssumidoEm) return false;

  // Sem mensagem posterior, o marco é o momento em que o lojista
  // assumiu — senão uma conversa sem resposta ficaria presa para sempre.
  const referencia = ultimaMensagemEm ?? controleAssumidoEm;
  const marco = new Date(referencia);
  if (Number.isNaN(marco.getTime())) return false;

  return agora.getTime() - marco.getTime() >= OCIOSIDADE_MS;
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/conversas/fluxo-webhook.test.ts`
Esperado: PASS, 5 testes.

- [ ] **Step 4b: Extrair e testar a decisão de a IA responder**

O spec exige um teste provando que conversa sob controle humano não chama a IA nem gasta crédito. Essa decisão não pode ficar solta dentro do webhook, que é um handler grande e difícil de testar. Acrescentar a `src/services/conversas/fluxo-webhook.ts`:

```ts
import type { Conversa } from './conversa-repo.js';

export type DecisaoAtendimento =
  | { iaResponde: true; devolverControle: boolean }
  | { iaResponde: false; devolverControle: false };

/**
 * Decide se a IA atende esta mensagem.
 *
 * Separado do webhook de propósito: é a regra que impede a IA de falar
 * por cima do lojista, e precisa ser testável sem subir servidor nem
 * simular a Meta.
 */
export function decidirAtendimento(
  conversa: Conversa | null,
  agora: Date = new Date(),
): DecisaoAtendimento {
  if (!conversa?.sobControleHumano) {
    return { iaResponde: true, devolverControle: false };
  }

  if (deveDevolverControle(conversa.controleAssumidoEm, conversa.ultimaMensagemEm, agora)) {
    return { iaResponde: true, devolverControle: true };
  }

  return { iaResponde: false, devolverControle: false };
}
```

E acrescentar ao teste:

```ts
import { decidirAtendimento } from './fluxo-webhook.js';

describe('decidirAtendimento', () => {
  const base = {
    id: 'x', restauranteId: 'r', telefoneCliente: '55119',
    ultimaMensagemClienteEm: null, ultimaMensagemEm: '2026-08-03T11:50:00.000Z',
    sobControleHumano: false, controleAssumidoEm: null,
  };

  it('IA responde quando ninguem assumiu', () => {
    expect(decidirAtendimento(base as any, AGORA)).toEqual({ iaResponde: true, devolverControle: false });
  });

  it('IA responde em conversa que ainda nao existe', () => {
    expect(decidirAtendimento(null, AGORA)).toEqual({ iaResponde: true, devolverControle: false });
  });

  // O teste central: com o lojista no comando, a IA nao pode responder
  // nem consumir credito.
  it('IA NAO responde com o lojista no comando ha pouco', () => {
    const c = { ...base, sobControleHumano: true, controleAssumidoEm: '2026-08-03T11:40:00.000Z' };
    expect(decidirAtendimento(c as any, AGORA)).toEqual({ iaResponde: false, devolverControle: false });
  });

  it('IA volta e pede devolucao do controle apos a ociosidade', () => {
    const c = { ...base, sobControleHumano: true, controleAssumidoEm: '2026-08-03T10:00:00.000Z', ultimaMensagemEm: '2026-08-03T11:00:00.000Z' };
    expect(decidirAtendimento(c as any, AGORA)).toEqual({ iaResponde: true, devolverControle: true });
  });
});
```

No webhook (Step 7), usar `decidirAtendimento` em vez de repetir a regra inline: se `iaResponde` for falso, sair antes do consumo de crédito; se `devolverControle` for verdadeiro, chamar `definirControleHumano(..., false)` antes de seguir.

Rodar: `npm test -- src/services/conversas/fluxo-webhook.test.ts`
Esperado: PASS, 9 testes.

- [ ] **Step 5: Implementar o armazenamento de áudio**

Criar `src/services/whatsapp/audio-storage.ts`:

```ts
import { supabaseAdmin } from '../../config/supabase.js';
import { downloadWhatsAppMedia } from './meta-cloud-api.js';

const BUCKET = 'audios-whatsapp';

/**
 * Baixa o áudio da Meta e guarda no Supabase Storage.
 *
 * O link que a Meta devolve expira em pouco tempo, então guardar depois
 * não é possível: ou baixamos no instante em que a mensagem chega, ou o
 * áudio se perde. O bucket é privado; a leitura acontece por URL
 * assinada, gerada sob demanda pela nossa API.
 *
 * Devolve null em caso de falha, de propósito: perder o áudio não pode
 * impedir o atendimento. A transcrição já basta para a IA responder.
 */
export async function salvarAudioDaMeta(
  mediaId: string,
  token: string,
  restauranteId: string,
): Promise<string | null> {
  try {
    const buffer = await downloadWhatsAppMedia(mediaId, token);
    const caminho = `${restauranteId}/${mediaId}.ogg`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(caminho, buffer, { contentType: 'audio/ogg', upsert: true });

    if (error) {
      console.error('[Audio] Falha ao guardar no Storage:', error.message);
      return null;
    }

    return caminho;
  } catch (erro) {
    console.error('[Audio] Falha ao baixar da Meta:', erro);
    return null;
  }
}

/**
 * URL temporária para o painel tocar o áudio. O bucket é privado, então
 * o link precisa ser assinado e tem validade curta.
 */
export async function urlAssinadaDoAudio(caminho: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(caminho, 60 * 60);

  return data?.signedUrl ?? null;
}
```

- [ ] **Step 6: Criar o bucket no Supabase**

No painel do Supabase, em Storage, criar um bucket chamado `audios-whatsapp` com acesso **privado**. Sem isso o upload falha e o áudio nunca aparece no painel.

- [ ] **Step 7: Alterar o fluxo do webhook em `src/server.ts`**

Acrescentar aos imports do topo:

```ts
import { gravarMensagem, ultimasMensagens } from './services/conversas/mensagem-repo.js';
import { buscarConversa, registrarMensagemDoCliente, registrarMensagemNossa, definirControleHumano } from './services/conversas/conversa-repo.js';
import { deveDevolverControle } from './services/conversas/fluxo-webhook.js';
import { salvarAudioDaMeta } from './services/whatsapp/audio-storage.js';
```

Dentro do processamento da mensagem, **depois** de identificar o `restauranteId` e o `metaToken`, e **antes** do bloco de consumo de créditos, inserir:

```ts
          // Grava a mensagem ANTES de qualquer processamento. Se a IA
          // falhar, a mensagem do cliente continua registrada e visível
          // na caixa de entrada — o lojista vê que alguém falou com ele
          // e pode responder na mão. Gravando depois, uma falha da IA
          // faria a mensagem sumir sem deixar rastro.
          const agoraIso = new Date().toISOString();
          let audioCaminho: string | null = null;

          if (messageType === 'audio' && mediaId) {
            audioCaminho = await salvarAudioDaMeta(mediaId, metaToken!, restauranteId);
          }

          const idMensagemCliente = await gravarMensagem({
            restauranteId,
            telefoneCliente: fromPhone,
            direcao: 'recebida',
            autor: 'cliente',
            tipo: messageType === 'audio' ? 'audio' : 'texto',
            texto: messageType === 'audio' ? null : textoEntradaBruto,
            audioUrl: audioCaminho,
            whatsappMessageId: messageId,
          });

          await registrarMensagemDoCliente(restauranteId, fromPhone, agoraIso);

          // Conversa sob controle humano: a IA não responde e não gasta
          // crédito. A devolução automática é avaliada aqui, na chegada
          // da mensagem, em vez de por agendador.
          const conversa = await buscarConversa(restauranteId, fromPhone);

          if (conversa?.sobControleHumano) {
            if (deveDevolverControle(conversa.controleAssumidoEm, conversa.ultimaMensagemEm)) {
              await definirControleHumano(restauranteId, fromPhone, false);
            } else {
              console.log(`[Webhook] Conversa ${fromPhone} sob controle do lojista. IA nao responde.`);
              return;
            }
          }
```

Observação para quem implementar: o nome exato da variável que hoje guarda o texto recebido e o id da mídia precisa ser conferido no arquivo — o trecho acima usa `textoEntradaBruto` e `mediaId` como referência. Use os nomes que já existem no fluxo, sem renomear nada.

Depois da transcrição do áudio, gravar a transcrição na mensagem já criada:

```ts
            if (idMensagemCliente && textoEntrada) {
              await supabaseAdmin
                .from('mensagens')
                .update({ transcricao: textoEntrada })
                .eq('id', idMensagemCliente);
            }
```

Na chamada da IA, passar o histórico:

```ts
            const historico = await ultimasMensagens(restauranteId, fromPhone, 20);

            const respostaIA = await processCustomerMessageWithAI({
              restauranteId,
              telefoneCliente: fromPhone,
              mensagemTexto: textoEntrada,
              historicoConversa: historico.map((m) => ({
                role: m.autor === 'cliente' ? ('user' as const) : ('assistant' as const),
                content: m.transcricao ?? m.texto ?? '',
              })).filter((m) => m.content.length > 0),
            });
```

E, depois de enviar a resposta com sucesso, gravá-la:

```ts
              await gravarMensagem({
                restauranteId,
                telefoneCliente: fromPhone,
                direcao: 'enviada',
                autor: 'ia',
                texto: respostaTexto,
              });
              await registrarMensagemNossa(restauranteId, fromPhone, new Date().toISOString());
```

- [ ] **Step 8: Rodar tudo**

Rodar: `npm test` e `npx tsc --noEmit`
Esperado: limpos.

- [ ] **Step 9: Commit**

```bash
git add src/services/conversas/ src/services/whatsapp/audio-storage.ts src/server.ts
git commit -m "feat: Grava as mensagens e da memoria de conversa a IA" -m "A IA respondia cada mensagem isoladamente porque o historicoConversa nunca era preenchido. Agora o webhook grava tudo antes de processar e alimenta o historico." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Cardápio no backend

**Files:**
- Create: `src/services/cardapio/cardapio-repo.ts`
- Create: `src/services/cardapio/cardapio-para-ia.ts`
- Create: `src/services/cardapio/cardapio-para-ia.test.ts`
- Modify: `src/server.ts` (rotas de cardápio), `src/services/ai/openai-agent.ts` (usar o cardápio)

**Interfaces:**
- Consumes: tabelas `categorias_cardapio`, `produtos_cardapio`, `complementos`, `produto_complementos` (já existem)
- Produces:
  - De `cardapio-repo.js`: `type Produto = { id: string; categoriaId: string | null; nome: string; descricao: string | null; preco: number; disponivel: boolean; ordem: number }`; `type Categoria = { id: string; nome: string; ordem: number; produtos: Produto[] }`; `listarCardapio(restauranteId): Promise<Categoria[]>`; `criarCategoria`, `atualizarCategoria`, `removerCategoria`, `criarProduto`, `atualizarProduto`, `removerProduto`
  - De `cardapio-para-ia.js`: `montarTextoDoCardapio(categorias: Categoria[]): string`
- Rotas: `GET/POST/PUT/DELETE /api/cardapio/categorias`, `GET/POST/PUT/DELETE /api/cardapio/produtos`

- [ ] **Step 1: Escrever o teste do texto para a IA**

Criar `src/services/cardapio/cardapio-para-ia.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { montarTextoDoCardapio } from './cardapio-para-ia.js';

const cardapio = [
  {
    id: 'c1', nome: 'Pizzas', ordem: 0,
    produtos: [
      { id: 'p1', categoriaId: 'c1', nome: 'Calabresa', descricao: 'Molho, mucarela e calabresa', preco: 45, disponivel: true, ordem: 0 },
      { id: 'p2', categoriaId: 'c1', nome: 'Portuguesa', descricao: null, preco: 49.9, disponivel: false, ordem: 1 },
    ],
  },
  { id: 'c2', nome: 'Bebidas', ordem: 1, produtos: [
      { id: 'p3', categoriaId: 'c2', nome: 'Refrigerante 2L', descricao: null, preco: 12, disponivel: true, ordem: 0 },
  ] },
];

describe('montarTextoDoCardapio', () => {
  it('inclui nome e preco dos produtos disponiveis', () => {
    const texto = montarTextoDoCardapio(cardapio as any);
    expect(texto).toContain('Calabresa');
    expect(texto).toContain('45,00');
    expect(texto).toContain('Refrigerante 2L');
  });

  // Produto indisponivel no texto faria a IA vender o que acabou, e o
  // pedido chegaria na cozinha sem poder ser feito.
  it('omite produto indisponivel', () => {
    const texto = montarTextoDoCardapio(cardapio as any);
    expect(texto).not.toContain('Portuguesa');
  });

  it('agrupa por categoria', () => {
    const texto = montarTextoDoCardapio(cardapio as any);
    expect(texto.indexOf('Pizzas')).toBeLessThan(texto.indexOf('Calabresa'));
    expect(texto.indexOf('Bebidas')).toBeLessThan(texto.indexOf('Refrigerante'));
  });

  it('inclui a descricao quando existe', () => {
    expect(montarTextoDoCardapio(cardapio as any)).toContain('calabresa');
  });

  // Cardapio vazio nao pode virar prompt quebrado: a IA precisa saber
  // que nao ha o que vender e dizer isso ao cliente.
  it('deixa claro quando nao ha cardapio', () => {
    const texto = montarTextoDoCardapio([]);
    expect(texto.toLowerCase()).toContain('nenhum item');
  });

  // Categoria sem nenhum produto disponivel nao deve aparecer.
  it('omite categoria que ficou sem produtos', () => {
    const so_indisponivel = [{ id: 'c1', nome: 'Sobremesas', ordem: 0, produtos: [
      { id: 'p9', categoriaId: 'c1', nome: 'Pudim', descricao: null, preco: 10, disponivel: false, ordem: 0 },
    ] }];
    expect(montarTextoDoCardapio(so_indisponivel as any)).not.toContain('Sobremesas');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/cardapio/cardapio-para-ia.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Criar `src/services/cardapio/cardapio-para-ia.ts`:

```ts
import type { Categoria } from './cardapio-repo.js';

/**
 * Monta o cardápio em texto para entrar no prompt da IA.
 *
 * Roda a cada mensagem recebida, então precisa ser barato: um cardápio
 * de 40 itens gera algo em torno de 600 palavras.
 *
 * Produto indisponível é omitido de propósito. Se entrasse, a IA
 * ofereceria o que acabou e o pedido chegaria à cozinha sem poder ser
 * feito.
 */
export function montarTextoDoCardapio(categorias: Categoria[]): string {
  const linhas: string[] = [];

  for (const categoria of categorias) {
    const disponiveis = categoria.produtos.filter((p) => p.disponivel);
    if (disponiveis.length === 0) continue;

    linhas.push(`## ${categoria.nome}`);

    for (const produto of disponiveis) {
      const preco = produto.preco.toFixed(2).replace('.', ',');
      const descricao = produto.descricao ? ` — ${produto.descricao}` : '';
      linhas.push(`- ${produto.nome}: R$ ${preco}${descricao}`);
    }

    linhas.push('');
  }

  if (linhas.length === 0) {
    return 'Nenhum item disponível no cardápio no momento.';
  }

  return linhas.join('\n').trim();
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/cardapio/cardapio-para-ia.test.ts`
Esperado: PASS, 6 testes.

- [ ] **Step 5: Implementar o repositório**

Criar `src/services/cardapio/cardapio-repo.ts` com as funções declaradas no bloco de interfaces. Todas filtram por `restaurante_id` explicitamente, porque `supabaseAdmin` faz bypass de RLS. `listarCardapio` faz uma consulta em `categorias_cardapio` e outra em `produtos_cardapio`, e agrupa em memória — duas consultas simples são mais previsíveis que um join aninhado do PostgREST, e o volume é de dezenas de linhas.

`removerCategoria` deve recusar quando ainda houver produto associado, devolvendo erro claro em português, em vez de deixar produtos órfãos.

`removerProduto` marca `disponivel = false` em vez de apagar quando o produto já aparece em algum `itens_pedido` — apagar quebraria o histórico. Se nunca foi pedido, apaga de verdade.

- [ ] **Step 6: Ligar o cardápio à IA**

Em `src/services/ai/openai-agent.ts`, antes de montar as mensagens do modelo, buscar o cardápio e incluir no prompt de sistema:

```ts
  const cardapio = await listarCardapio(restauranteId);
  const textoCardapio = montarTextoDoCardapio(cardapio);
```

E acrescentar ao conteúdo do prompt de sistema uma seção com esse texto, precedida de uma instrução explícita de que a IA só pode oferecer itens dessa lista e usar exatamente esses preços.

- [ ] **Step 7: Acrescentar as rotas em `src/server.ts`**

Todas com `autenticar` e `exigirAssinaturaAtiva`, usando `req.restauranteId`:

```
GET    /api/cardapio                    lista categorias com produtos
POST   /api/cardapio/categorias         cria categoria
PUT    /api/cardapio/categorias/:id     renomeia ou reordena
DELETE /api/cardapio/categorias/:id     remove
POST   /api/cardapio/produtos           cria produto
PUT    /api/cardapio/produtos/:id       edita
DELETE /api/cardapio/produtos/:id       remove
```

Validação de preço: número positivo, no máximo duas casas decimais. Recusar com 400 e mensagem em português caso contrário.

- [ ] **Step 8: Rodar tudo e commitar**

Rodar: `npm test` e `npx tsc --noEmit`

```bash
git add src/services/cardapio/ src/server.ts src/services/ai/openai-agent.ts
git commit -m "feat: Cria o cardapio no backend e liga ele ao prompt da IA" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Tela de cardápio

**Files:**
- Create: `frontend/src/pages/app/Cardapio.tsx`
- Create: `frontend/src/pages/app/Cardapio.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: as rotas da Task 4
- Produces: rota `/app/cardapio`

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/pages/app/Cardapio.test.tsx` cobrindo: a tela lista categorias e produtos vindos da API; criar categoria chama `POST /cardapio/categorias`; preço inválido (zero, negativo, texto) é recusado antes de chamar a API, com mensagem em português; alternar disponibilidade chama `PUT`; e a tela mostra um aviso quando o cardápio está vazio, explicando que a IA precisa dele para atender.

Use `vi.stubGlobal('fetch', ...)` como os testes existentes do projeto fazem, e verifique as chamadas com `mock.calls`.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm --prefix frontend test -- src/pages/app/Cardapio.test.tsx`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a tela**

Criar `frontend/src/pages/app/Cardapio.tsx` seguindo o padrão visual das telas do ciclo 2 (`Assinatura.tsx`, `Creditos.tsx`): paleta `brand-*`, `ink-*`, `stone-*`, textos em português, `role="alert"` nos erros.

Estrutura: lista de categorias, cada uma expansível com seus produtos; formulário inline para criar categoria e produto; botão de disponibilidade em cada produto; confirmação antes de remover.

O preço é digitado como número e exibido formatado em reais. Validar antes de enviar: positivo, no máximo duas casas.

- [ ] **Step 4: Registrar a rota**

Em `frontend/src/App.tsx`, acrescentar o import com lazy loading e a rota dentro do bloco protegido do painel:

```tsx
const Cardapio = lazy(() => import('./pages/app/Cardapio'));
```

```tsx
<Route path="/app/cardapio" element={<Cardapio />} />
```

- [ ] **Step 5: Rodar e commitar**

Rodar: `npm --prefix frontend test` e `npm --prefix frontend run build`

```bash
git add frontend/src/pages/app/Cardapio.tsx frontend/src/pages/app/Cardapio.test.tsx frontend/src/App.tsx
git commit -m "feat: Adiciona a tela de cadastro de cardapio" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Conectar WhatsApp

**Files:**
- Create: `src/services/whatsapp/conexao.ts`
- Create: `src/services/whatsapp/conexao.test.ts`
- Modify: `src/server.ts`
- Create: `frontend/src/pages/app/Configuracoes.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` de `src/utils/crypto.js`
- Produces: `testarConexao(phoneNumberId: string, token: string): Promise<{ ok: true; numero: string } | { ok: false; erro: string }>`; `salvarConexao(restauranteId, phoneNumberId, token): Promise<void>`; `estadoDaConexao(restauranteId): Promise<{ conectado: boolean; numero: string | null }>`; rotas `GET /api/whatsapp/conexao`, `POST /api/whatsapp/conexao`, `POST /api/whatsapp/conexao/testar`

- [ ] **Step 1: Escrever o teste**

Criar `src/services/whatsapp/conexao.test.ts` com a API da Meta mockada, cobrindo: token válido devolve `ok: true` com o número; token inválido devolve `ok: false` com mensagem **em português**, não o texto técnico da Meta; falha de rede também devolve `ok: false` sem lançar; e `salvarConexao` grava o token **criptografado**, nunca em texto puro — verificar que o valor gravado é diferente do original e que `decrypt` o recupera.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/whatsapp/conexao.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

Criar `src/services/whatsapp/conexao.ts`. `testarConexao` faz um `GET` em `https://graph.facebook.com/v21.0/{phoneNumberId}` com o token no cabeçalho; resposta 200 confirma que o par é válido e traz o número formatado. Traduzir os erros comuns para português: token inválido ou expirado, número não encontrado, sem permissão.

`salvarConexao` grava `meta_phone_number_id` em texto e `meta_access_token` **cifrado com `encrypt`**. O `schema.sql` já documenta essa exigência, e o webhook já decifra na leitura.

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/whatsapp/conexao.test.ts`

- [ ] **Step 5: Acrescentar as rotas e a tela**

Rotas com `autenticar` e `exigirAssinaturaAtiva`. A rota de leitura **nunca devolve o token**, nem cifrado — só se está conectado e qual o número.

Criar `frontend/src/pages/app/Configuracoes.tsx` com a seção de conexão: campos para o ID do número e o token, botão de testar, botão de salvar, e o estado atual. Quando não houver cardápio cadastrado, mostrar aviso destacado explicando que a IA vai atender sem saber o que vender.

Registrar `/app/configuracoes` em `App.tsx` com lazy loading.

- [ ] **Step 6: Rodar tudo e commitar**

```bash
git add src/services/whatsapp/conexao.ts src/services/whatsapp/conexao.test.ts src/server.ts frontend/src/pages/app/Configuracoes.tsx frontend/src/App.tsx
git commit -m "feat: Permite conectar o WhatsApp do restaurante pelo painel" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Caixa de entrada no backend

**Files:**
- Modify: `src/server.ts`
- Create: `src/services/conversas/envio.ts`
- Create: `src/services/conversas/envio.test.ts`

**Interfaces:**
- Consumes: `listarConversas`, `buscarConversa`, `definirControleHumano` (Task 2); `gravarMensagem`, `marcarStatus` (Task 2); `calcularJanela` (Task 2); `urlAssinadaDoAudio` (Task 3); `sendWhatsAppTextMessage` (já existe)
- Produces: `enviarMensagemDoLojista(restauranteId, telefone, texto): Promise<{ ok: true; id: string } | { ok: false; erro: string }>`; rotas `GET /api/atendimento/conversas`, `GET /api/atendimento/conversas/:telefone/mensagens`, `POST /api/atendimento/conversas/:telefone/mensagens`, `POST /api/atendimento/conversas/:telefone/controle`

- [ ] **Step 1: Escrever o teste do envio**

Criar `src/services/conversas/envio.test.ts`, com `conversa-repo`, `mensagem-repo` e `meta-cloud-api` mockados. Cobrir:

- Janela aberta: grava a mensagem com status `enviando`, chama a Meta, marca `ok`.
- **Janela fechada: recusa sem chamar a Meta**, devolvendo mensagem em português. Este é o teste central da tarefa — sem ele, o bloqueio existiria só no front e uma requisição direta contornaria.
- Falha da Meta: mensagem fica com status `falha` e o motivo é devolvido, sem lançar.
- Conversa inexistente: recusa com mensagem clara.

Use um relógio controlado (`vi.setSystemTime`) para posicionar a janela.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- src/services/conversas/envio.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o envio**

Criar `src/services/conversas/envio.ts`:

```ts
import { supabaseAdmin } from '../../config/supabase.js';
import { decrypt } from '../../utils/crypto.js';
import { env } from '../../config/env.js';
import { sendWhatsAppTextMessage } from '../whatsapp/meta-cloud-api.js';
import { buscarConversa, registrarMensagemNossa } from './conversa-repo.js';
import { gravarMensagem, marcarStatus } from './mensagem-repo.js';
import { calcularJanela } from './janela.js';

export type ResultadoEnvio =
  | { ok: true; id: string }
  | { ok: false; erro: string };

/**
 * Envia uma mensagem escrita pelo lojista na caixa de entrada.
 *
 * A checagem da janela de 24 horas acontece AQUI, no servidor, e não só
 * na tela: o campo desabilitado no front é conveniência, mas uma
 * requisição direta contornaria. A Meta recusaria de qualquer forma, e o
 * erro dela é técnico e em inglês — melhor barrar antes com explicação
 * que o lojista entenda.
 */
export async function enviarMensagemDoLojista(
  restauranteId: string,
  telefone: string,
  texto: string,
): Promise<ResultadoEnvio> {
  const conversa = await buscarConversa(restauranteId, telefone);

  if (!conversa) {
    return { ok: false, erro: 'Conversa não encontrada.' };
  }

  const janela = calcularJanela(conversa.ultimaMensagemClienteEm);

  if (!janela.aberta) {
    return {
      ok: false,
      erro:
        'A Meta só permite responder até 24 horas após a última mensagem do cliente. ' +
        'Esta conversa expirou e só pode ser retomada com um modelo de mensagem aprovado.',
    };
  }

  const { data: restaurante } = await supabaseAdmin
    .from('restaurantes')
    .select('meta_phone_number_id, meta_access_token')
    .eq('id', restauranteId)
    .single();

  if (!restaurante?.meta_phone_number_id) {
    return { ok: false, erro: 'Este restaurante ainda não conectou o WhatsApp.' };
  }

  const token = restaurante.meta_access_token
    ? decrypt(restaurante.meta_access_token)
    : env.META_WHATSAPP_TOKEN;

  if (!token) {
    return { ok: false, erro: 'Token do WhatsApp ausente. Reconecte nas configurações.' };
  }

  // Grava antes de enviar, com status 'enviando': a mensagem aparece na
  // tela do lojista imediatamente, em vez de depois da ida à Meta.
  const id = await gravarMensagem({
    restauranteId,
    telefoneCliente: telefone,
    direcao: 'enviada',
    autor: 'lojista',
    texto,
    status: 'enviando',
  });

  try {
    await sendWhatsAppTextMessage({
      toPhoneNumber: telefone,
      text: texto,
      phoneNumberId: restaurante.meta_phone_number_id,
      token,
    });

    await marcarStatus(id, 'ok');
    await registrarMensagemNossa(restauranteId, telefone, new Date().toISOString());
    return { ok: true, id };
  } catch (erro: any) {
    await marcarStatus(id, 'falha', erro?.message ?? 'Erro desconhecido');
    return { ok: false, erro: 'Não foi possível entregar a mensagem. Tente novamente.' };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- src/services/conversas/envio.test.ts`

- [ ] **Step 5: Acrescentar as rotas**

Em `src/server.ts`, todas com `autenticar` e `exigirAssinaturaAtiva`:

- `GET /api/atendimento/conversas` — lista conversas do restaurante, cada uma com o estado da janela calculado e o nome do cliente vindo de `clientes_crm`.
- `GET /api/atendimento/conversas/:telefone/mensagens` — histórico da conversa, com URL assinada para os áudios.
- `POST /api/atendimento/conversas/:telefone/mensagens` — chama `enviarMensagemDoLojista`; devolve 200 no sucesso e 400 com a mensagem de erro em caso de recusa.
- `POST /api/atendimento/conversas/:telefone/controle` — recebe `{ humano: boolean }` e chama `definirControleHumano`.

Todas filtram por `req.restauranteId`.

- [ ] **Step 6: Rodar tudo e commitar**

```bash
git add src/services/conversas/envio.ts src/services/conversas/envio.test.ts src/server.ts
git commit -m "feat: Cria as rotas da caixa de entrada com a trava da janela de 24h" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Isolamento entre restaurantes com o Supabase Realtime

Esta tarefa é curta mas é a de maior risco do ciclo: é a primeira vez que o navegador lê o banco direto, sem passar pela nossa API.

**Files:**
- Create: `frontend/src/services/supabase.ts`
- Create: `src/database/isolamento-realtime.test.ts`
- Modify: `frontend/package.json`, `frontend/.env`

**Interfaces:**
- Consumes: RLS da Task 1
- Produces: `criarClienteSupabase(token: string)` de `frontend/src/services/supabase.ts`

- [ ] **Step 1: Escrever o teste de isolamento contra o banco real**

Criar `src/database/isolamento-realtime.test.ts`. Ele cria **dois** restaurantes de fixture, insere uma conversa e uma mensagem em cada, e então monta um cliente Supabase autenticado com um JWT do restaurante A — usando a mesma função de assinatura que a rota de login usa — e prova que:

- A lê as próprias mensagens.
- **A não lê nenhuma mensagem de B.**
- O mesmo para `conversas`.

Apagar as duas fixtures no `afterAll`, mesmo em caso de falha, filtrando por id.

Este teste roda contra o Supabase real. Se ele passar por engano — por exemplo, porque o cliente foi criado com a service role em vez do JWT do usuário —, o isolamento não estará provado. Garanta que o cliente usa a chave `anon` mais o JWT, nunca a `service_role`.

- [ ] **Step 2: Rodar e ver falhar ou passar**

Rodar: `npm test -- src/database/isolamento-realtime.test.ts`

Se falhar com A enxergando dados de B, a policy da migration 009 está errada e precisa ser corrigida antes de qualquer coisa do frontend.

- [ ] **Step 3: Instalar o cliente no frontend**

```bash
npm --prefix frontend install @supabase/supabase-js
```

- [ ] **Step 4: Criar o cliente**

Criar `frontend/src/services/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase usado só para o Realtime da caixa de entrada.
 *
 * A leitura é feita com a chave anon MAIS o JWT do lojista — o mesmo que
 * a nossa API emite, com `sub = restaurante_id`. É esse token que faz as
 * policies de RLS isolarem um restaurante do outro. Usar a service role
 * aqui exporia o banco inteiro no navegador.
 *
 * Só leitura: todo envio continua passando pela nossa API, para nenhuma
 * mensagem escapar das checagens de janela, crédito e token.
 */
export function criarClienteSupabase(token: string) {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
```

- [ ] **Step 5: Declarar as variáveis do frontend**

Em `frontend/.env` (desenvolvimento) e na Vercel (produção), acrescentar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. A chave anon é pública por definição — o que protege os dados é a RLS, não o segredo da chave. Na Vercel, lembrar que variável `VITE_` só entra no bundle em novo build.

- [ ] **Step 6: Commit**

```bash
git add src/database/isolamento-realtime.test.ts frontend/src/services/supabase.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: Prepara o Realtime com prova de isolamento entre restaurantes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Tela da caixa de entrada

**Files:**
- Create: `frontend/src/pages/app/Atendimento.tsx`
- Create: `frontend/src/components/app/ListaConversas.tsx`
- Create: `frontend/src/components/app/Conversa.tsx`
- Create: `frontend/src/components/app/CampoEnvio.tsx`
- Create: `frontend/src/components/app/CampoEnvio.test.tsx`
- Create: `frontend/src/pages/app/Atendimento.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: rotas da Task 7; `criarClienteSupabase` da Task 8
- Produces: rota `/app/atendimento`

- [ ] **Step 1: Escrever o teste do campo de envio**

Criar `frontend/src/components/app/CampoEnvio.test.tsx` cobrindo:

- Janela aberta: campo habilitado e o tempo restante visível.
- **Janela fechada: campo desabilitado e a explicação em português na tela.**
- Faltando menos de uma hora: o aviso fica destacado.
- Enviar chama a API e limpa o campo.
- Erro devolvido pela API aparece para o lojista.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm --prefix frontend test -- src/components/app/CampoEnvio.test.tsx`

- [ ] **Step 3: Implementar os componentes**

`ListaConversas.tsx` — coluna esquerda: nome do cliente (ou o telefone quando não houver nome), trecho da última mensagem, horário, e marca visual em quem está sob controle humano.

`Conversa.tsx` — coluna direita: mensagens em balões, distinguindo `cliente`, `ia` e `lojista`. Distinguir IA de lojista importa: quando o lojista volta na conversa, ele precisa saber o que a IA prometeu em nome dele. Áudio com `<audio controls>` e a transcrição abaixo. Mensagem com status `falha` aparece marcada, com o motivo.

`CampoEnvio.tsx` — campo de digitação, botão de enviar, o estado da janela, e os botões de assumir e devolver a conversa.

`Atendimento.tsx` — junta as duas colunas, carrega a lista e o histórico pela API, e assina o Realtime para inserir mensagens novas assim que chegam. Cancelar a assinatura ao desmontar, senão cada visita à tela deixa uma conexão aberta.

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm --prefix frontend test -- src/components/app/CampoEnvio.test.tsx src/pages/app/Atendimento.test.tsx`

- [ ] **Step 5: Registrar a rota**

Em `App.tsx`, com lazy loading:

```tsx
const Atendimento = lazy(() => import('./pages/app/Atendimento'));
```

```tsx
<Route path="/app/atendimento" element={<Atendimento />} />
```

- [ ] **Step 6: Rodar tudo e commitar**

Rodar: `npm --prefix frontend test` e `npm --prefix frontend run build`

```bash
git add frontend/src/pages/app/Atendimento.tsx frontend/src/pages/app/Atendimento.test.tsx frontend/src/components/app/ frontend/src/App.tsx
git commit -m "feat: Adiciona a caixa de entrada com resposta manual e tempo real" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Resend e recuperação de senha no backend

**Files:**
- Create: `src/database/migrations/010_tokens_recuperacao.sql`
- Create: `src/services/email/resend-client.ts`, `src/services/email/templates.ts`
- Create: `src/services/auth/recuperacao-senha.ts`, `src/services/auth/recuperacao-senha.test.ts`
- Modify: `src/config/env.ts`, `src/server.ts`

**Interfaces:**
- Produces: `gerarTokenRecuperacao(email): Promise<void>`; `validarToken(token): Promise<string | null>` (devolve o `usuario_id`); `consumirTokenERedefinir(token, novaSenha): Promise<boolean>`; rotas `POST /api/auth/esqueci-senha`, `POST /api/auth/redefinir-senha`

- [ ] **Step 1: Escrever a migration**

Criar `src/database/migrations/010_tokens_recuperacao.sql` com a tabela `tokens_recuperacao`: `id`, `usuario_id` (FK para `usuarios`, `ON DELETE CASCADE`), `token_hash TEXT NOT NULL`, `expira_em TIMESTAMP WITH TIME ZONE NOT NULL`, `usado_em TIMESTAMP WITH TIME ZONE`, `created_at`. Índice em `token_hash`. RLS habilitada com policy só para `service_role` — nenhum lojista precisa ler essa tabela.

Guardar o **hash** do token, nunca o token: quem ler o banco não pode usar os links pendentes. Mesmo princípio da senha.

- [ ] **Step 2: Aplicar no Supabase e conferir**

Rodar no SQL Editor; rodar duas vezes para confirmar idempotência.

- [ ] **Step 3: Escrever o teste da recuperação**

Criar `src/services/auth/recuperacao-senha.test.ts`, com o Resend e o banco mockados, cobrindo:

- Token gerado é aleatório e o que vai para o banco é o **hash**, não o token.
- Token válido e dentro do prazo devolve o usuário.
- **Token expirado é recusado.**
- **Token já usado é recusado** — uso único, senão o link no e-mail vira chave permanente.
- Token inexistente é recusado.
- Redefinir grava a senha com bcrypt e marca o token como usado.

- [ ] **Step 4: Rodar e ver falhar**

Rodar: `npm test -- src/services/auth/recuperacao-senha.test.ts`

- [ ] **Step 5: Implementar**

`RESEND_API_KEY` opcional no `env.ts`, como as chaves do Stripe: o servidor precisa continuar subindo sem ela.

`resend-client.ts` valida a chave no uso, não no import, e envia de `contato@atendiarp.com.br`.

`recuperacao-senha.ts` gera 32 bytes aleatórios em hexadecimal, guarda o hash SHA-256, validade de 1 hora.

- [ ] **Step 6: Acrescentar as rotas**

`POST /api/auth/esqueci-senha` — **responde sempre igual**, exista a conta ou não: "Se este e-mail estiver cadastrado, você receberá as instruções." Sem isso, qualquer pessoa descobre quais e-mails são clientes testando um por um. É o mesmo cuidado já adotado no login e no CNPJ duplicado do cadastro.

Limitar tentativas por e-mail, para o formulário não virar ferramenta de spam contra os próprios clientes.

`POST /api/auth/redefinir-senha` — recebe token e senha nova, valida, grava com bcrypt, marca o token como usado.

Nenhuma das duas passa por `autenticar`: quem esqueceu a senha não tem sessão.

- [ ] **Step 7: Ligar o aviso de cota por e-mail**

Pendência do ciclo 2: quando a RPC de consumo devolver saldo insuficiente, disparar o e-mail de cota esgotada, com trava de um envio por ciclo de cobrança para cada mensagem que chega não virar um e-mail.

- [ ] **Step 8: Rodar tudo e commitar**

```bash
git add src/database/migrations/010_tokens_recuperacao.sql src/services/email/ src/services/auth/ src/config/env.ts src/server.ts
git commit -m "feat: Cria a recuperacao de senha e o envio de e-mail" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Telas de recuperação de senha

**Files:**
- Create: `frontend/src/pages/site/EsqueciSenha.tsx`, `frontend/src/pages/site/RedefinirSenha.tsx`
- Create: `frontend/src/pages/site/RedefinirSenha.test.tsx`
- Modify: `frontend/src/pages/app/Login.tsx`, `frontend/src/App.tsx`

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/pages/site/RedefinirSenha.test.tsx` cobrindo: senha curta demais é recusada antes de chamar a API; senha e confirmação diferentes são recusadas; sucesso redireciona para o login com aviso; token inválido mostra mensagem clara e um caminho para pedir outro link.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm --prefix frontend test -- src/pages/site/RedefinirSenha.test.tsx`

- [ ] **Step 3: Implementar as duas telas**

`EsqueciSenha.tsx` — campo de e-mail e a confirmação neutra, igual à resposta do backend: nunca revelar se a conta existe.

`RedefinirSenha.tsx` — lê o token da URL, pede senha e confirmação, valida os 8 caracteres mínimos, envia.

Seguir o padrão visual do site (`Cadastro.tsx`), com label associado a cada campo e `role="alert"` nos erros.

- [ ] **Step 4: Ligar no login**

Em `frontend/src/pages/app/Login.tsx`, acrescentar o link "Esqueci minha senha" apontando para `/esqueci-senha`.

- [ ] **Step 5: Registrar as rotas**

Em `App.tsx`, dentro do bloco público do `SiteLayout` — quem esqueceu a senha não está logado:

```tsx
<Route path="/esqueci-senha" element={<EsqueciSenha />} />
<Route path="/redefinir-senha" element={<RedefinirSenha />} />
```

- [ ] **Step 6: Rodar tudo e commitar**

```bash
git add frontend/src/pages/site/EsqueciSenha.tsx frontend/src/pages/site/RedefinirSenha.tsx frontend/src/pages/site/RedefinirSenha.test.tsx frontend/src/pages/app/Login.tsx frontend/src/App.tsx
git commit -m "feat: Adiciona as telas de recuperacao de senha" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Menu lateral

**Files:**
- Create: `frontend/src/components/app/MenuLateral.tsx`, `frontend/src/components/app/MenuLateral.test.tsx`
- Modify: `frontend/src/components/app/PainelLayout.tsx`
- Modify: `frontend/src/pages/app/Dashboard.tsx`, `Crm.tsx`, `Ifood.tsx` (paleta)

- [ ] **Step 1: Escrever o teste**

Criar `frontend/src/components/app/MenuLateral.test.tsx` cobrindo: os sete itens aparecem com os destinos certos; o item da rota atual fica marcado como atual (`aria-current="page"`); o botão de sair limpa o token e leva ao login; e em viewport pequeno o menu começa recolhido.

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm --prefix frontend test -- src/components/app/MenuLateral.test.tsx`

- [ ] **Step 3: Implementar o menu**

Criar `frontend/src/components/app/MenuLateral.tsx` com os destinos:

```
/app/atendimento   Atendimento
/app/pdv           Pedidos
/app/crm           CRM
/app/cardapio      Cardápio
/app/configuracoes Configurações
/app/assinatura    Assinatura
/app/creditos      Créditos
```

Marca no topo, nome do restaurante, e botão de sair — que hoje não existe em lugar nenhum do painel. Retrátil em telas pequenas: o lojista vai abrir isso no celular no meio do movimento.

Se a rota `/app/pdv` ainda não existir, apontar para a tela de pedidos que existir hoje, sem criar rota nova nesta tarefa.

- [ ] **Step 4: Montar no layout**

Em `frontend/src/components/app/PainelLayout.tsx`, envolver o `<Outlet />` com o menu lateral, mantendo a `FaixaCota` e o `ProtectedRoute` que já estão lá.

- [ ] **Step 5: Unificar a paleta**

Trocar as classes azuis (`sky-*`, `blue-*`) das telas antigas — `Dashboard.tsx`, `Crm.tsx`, `Ifood.tsx` — pela paleta da marca (`brand-*`, `ink-*`, `stone-*`), como já fazem as telas do ciclo 2. Não mudar estrutura nem comportamento, só as classes de cor.

- [ ] **Step 6: Rodar tudo e commitar**

Rodar: `npm --prefix frontend test`, `npm --prefix frontend run build`, `npm test`, `npx tsc --noEmit`

```bash
git add frontend/src/components/app/ frontend/src/pages/app/
git commit -m "feat: Adiciona o menu lateral e unifica a paleta do painel" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Validação final do ciclo

Não é uma tarefa de código. Depende de: chaves reais de OpenAI e Groq, e o número de teste da Meta com o celular do dono cadastrado como destinatário.

- [ ] Conectar o número de teste pela tela de configurações e confirmar que o teste de conexão passa.
- [ ] Cadastrar um cardápio pequeno, com três ou quatro itens.
- [ ] Mandar mensagem de texto do celular e conferir que a IA responde usando os itens cadastrados, com os preços certos.
- [ ] Mandar um áudio e conferir que a transcrição aparece na caixa de entrada e que o áudio toca.
- [ ] Mandar duas mensagens em sequência ("quero uma pizza grande", depois "de calabresa") e confirmar que a IA liga uma na outra — prova da memória de conversa.
- [ ] Assumir a conversa, responder manualmente, e confirmar que a IA para de responder.
- [ ] Esperar 30 minutos, mandar mensagem nova e confirmar que a IA voltou a atender sozinha.
- [ ] Marcar um produto como indisponível e confirmar que a IA deixa de oferecê-lo.
- [ ] Pedir recuperação de senha e confirmar que o e-mail chega — e não na caixa de spam.

## Pendências fora do código

- **Chaves de OpenAI e Groq:** sem elas a IA não responde. Não dependem de aprovação de ninguém.
- **Resend:** contratar e verificar o domínio. O SPF da Hostinger já existe; o do Resend precisa ser incluído **no mesmo registro**, porque dois registros SPF no mesmo domínio invalidam os dois.
- **Bucket `audios-whatsapp`** no Supabase Storage, privado.
- **Templates da Meta:** submeter os de retomada de atendimento e de reativação com cupom. Enquanto não aprovados, conversa fora da janela fica sem saída e as campanhas do contrato não funcionam.
- **Verificação de provedora de tecnologia:** enquanto não sair, cada cliente novo exige conectar o WhatsApp manualmente.
