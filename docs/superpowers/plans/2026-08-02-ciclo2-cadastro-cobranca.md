# Ciclo 2 — Cadastro e Cobrança: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um restaurante cria conta, paga a assinatura pelo Stripe e tem o painel liberado sem nenhuma intervenção manual.

**Architecture:** O estado da assinatura vive no Postgres (Supabase), espelhado do Stripe por webhook — o webhook é o único código que escreve na tabela `assinaturas`. Painel, PDV e o atendimento por IA leem só do banco local, para que uma queda do Stripe nunca derrube o atendimento dos restaurantes. O saldo de créditos passa a ter dois baldes: cota mensal (reseta) e avulsos (não expiram).

**Tech Stack:** Node + Express + TypeScript (backend), Supabase/Postgres, Stripe (Checkout hospedado + Customer Portal), React 19 + Vite + React Router 7 + Tailwind (frontend), Vitest nos dois lados.

**Spec:** `docs/superpowers/specs/2026-08-02-ciclo2-cadastro-cobranca-design.md`

## Global Constraints

- **Respostas e mensagens de erro sempre em português brasileiro.** Vale para toda string visível ao usuário.
- **Nunca gravar senha em texto puro.** Sempre `bcrypt` — o banco tem `CHECK (senha_acesso LIKE '$2b$%')`.
- **Nunca escrever em `restaurantes.email_acesso` / `restaurantes.senha_acesso`.** São resquício; o login real usa a tabela `usuarios`.
- **Toda query com `supabaseAdmin` (service_role) faz bypass de RLS.** Incluir `WHERE restaurante_id = $1` manualmente, sempre. Está documentado no topo de `src/database/schema.sql`.
- **RPCs de crédito usam `SECURITY DEFINER` + `SET search_path = public, pg_temp`,** e têm `EXECUTE` revogado de `PUBLIC, anon, authenticated`, concedido só a `service_role`. Ver `005_hardening_rpc_v2.sql:232-240`. `CREATE OR REPLACE` **com a mesma assinatura** preserva esses grants; mudar a assinatura os perde.
- **Migrations são idempotentes** (`IF NOT EXISTS`, `CREATE OR REPLACE`), seguindo o padrão da 005.
- **JWT:** `sub = restaurante_id`, `role: 'authenticated'`, `aud: 'authenticated'`, mais `user_metadata`. É o formato exato que o RLS espera — não alterar.
- **Preço da assinatura:** R$ 179,99/mês. **Cota:** 10.000 créditos. **Pacotes avulsos:** 2.500 / R$ 59,90 · 5.000 / R$ 109,90 · 10.000 / R$ 199,90.
- **Custo em créditos:** texto = 1, áudio = 8.
- **Nenhum e-mail transacional neste ciclo.** Aviso de cota só na interface do painel.
- **Commits em português,** no padrão `tipo: Descrição no imperativo`, com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` no rodapé.

## File Structure

**Backend — criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/database/migrations/006_assinaturas_creditos.sql` | Tabelas `assinaturas` e `stripe_eventos_processados`, split do saldo, colunas de cadastro, RPCs revisadas |
| `src/services/billing/stripe-client.ts` | Instancia o SDK do Stripe e valida as variáveis de ambiente. Único lugar que conhece as chaves |
| `src/services/billing/assinatura-repo.ts` | Leitura e escrita da tabela `assinaturas`. Único módulo que escreve nela |
| `src/services/billing/checkout.ts` | Cria Customer, Checkout Sessions (assinatura e pacote) e sessão do Customer Portal |
| `src/services/billing/webhook-handler.ts` | Traduz eventos do Stripe em mudanças de estado. Sem Express dentro |
| `src/services/billing/status.ts` | Reconciliação sob demanda quando um webhook não chega |
| `src/services/billing/pacotes.ts` | Catálogo dos três pacotes avulsos, um lugar só |
| `src/services/cadastro/criar-conta.ts` | Validação e normalização do payload de cadastro |
| `src/utils/cnpj.ts` | Validação de CNPJ pelos dígitos verificadores |
| `src/middleware/autenticar.ts` | Lê o JWT e popula `req.restauranteId`, hoje repetido em cada rota |
| `src/middleware/exigir-assinatura.ts` | Middleware que barra quem não tem assinatura ativa |
| `vitest.config.ts` | Configuração do Vitest no backend |

**Backend — modificar:**

| Arquivo | Mudança |
|---|---|
| `src/config/env.ts` | Variáveis do Stripe e `APP_URL` |
| `src/server.ts` | Rotas de cadastro, billing e webhook do Stripe; custo do áudio de 3 para 8 |
| `package.json` | Dependência `stripe`, devDependência `vitest`, script `test` |

**Frontend — criar:**

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/contexts/AssinaturaContext.tsx` | Estado da assinatura e do saldo, carregado uma vez |
| `frontend/src/services/viacep.ts` | Consulta de CEP, sempre tolerante a falha |
| `frontend/src/pages/app/Pagamento.tsx` | Tela que leva ao Checkout de quem ainda não pagou |
| `frontend/src/pages/app/Confirmando.tsx` | Tela de polling do retorno do Checkout |
| `frontend/src/pages/app/Assinatura.tsx` | Status, portal do Stripe, cancelamento |
| `frontend/src/pages/app/Creditos.tsx` | Os três pacotes e o extrato de consumo |
| `frontend/src/components/app/FaixaCota.tsx` | Aviso de 80% e 100% da cota |
| `frontend/src/utils/cnpj.ts` | Mesma validação do backend, para feedback imediato |

**Frontend — modificar:** `App.tsx` (rotas novas e o provider), `ProtectedRoute.tsx` (prop `exigirAssinatura`), `Cadastro.tsx` (deixa de ser placeholder e vira o formulário), `Login.tsx` (corrigir o redirecionamento quebrado para `/app/dashboard`).

**Ordem das tarefas:** 1 → 2 → 3 → 4 (backend base) → 5 → 6 → 7 → 8 → 9 (cobrança) → 10 → 11 → 12 (interface) → 13 (verificação). A Task 11 registra rotas para telas criadas na Task 12; se as duas não forem feitas na sequência, criar os arquivos como stub conforme indicado no passo 9 da Task 11.

---

## Task 1: Vitest no backend

Hoje o backend não tem nenhum framework de teste. Sem isso, nada nas tarefas seguintes é testável.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/utils/cnpj.ts`
- Create: `src/utils/cnpj.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nada
- Produces: `npm test` na raiz roda a suíte do backend. `validarCnpj(cnpj: string): boolean` e `normalizarCnpj(cnpj: string): string` exportados de `src/utils/cnpj.ts`

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install --save-dev vitest@^4.1.10
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Adicionar o script de teste**

Em `package.json`, dentro de `"scripts"`, acrescentar:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Escrever o teste do validador de CNPJ**

Criar `src/utils/cnpj.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validarCnpj, normalizarCnpj } from './cnpj.js';

describe('normalizarCnpj', () => {
  it('remove pontuação e mantém só dígitos', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });
});

describe('validarCnpj', () => {
  it('aceita um CNPJ com dígitos verificadores corretos', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('aceita CNPJ sem pontuação', () => {
    expect(validarCnpj('11222333000181')).toBe(true);
  });

  it('recusa quando o dígito verificador está errado', () => {
    expect(validarCnpj('11222333000182')).toBe(false);
  });

  it('recusa quando não tem 14 dígitos', () => {
    expect(validarCnpj('1122233300018')).toBe(false);
  });

  // Todos os dígitos iguais passam no cálculo do verificador por
  // coincidência aritmética, mas nenhum é CNPJ real. Precisa de guarda
  // explícita, senão 00000000000000 entra no banco.
  it('recusa CNPJ com todos os dígitos iguais', () => {
    expect(validarCnpj('00000000000000')).toBe(false);
    expect(validarCnpj('11111111111111')).toBe(false);
  });

  it('recusa string vazia', () => {
    expect(validarCnpj('')).toBe(false);
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

```bash
npm test
```

Esperado: FAIL — `Failed to resolve import "./cnpj.js"`.

- [ ] **Step 6: Implementar o validador**

Criar `src/utils/cnpj.ts`:

```ts
/**
 * Validação de CNPJ pelos dígitos verificadores, não só pelo formato.
 * Formato sozinho deixa passar 11.111.111/1111-11, que nunca existirá.
 */

export function normalizarCnpj(cnpj: string): string {
  return (cnpj || '').replace(/\D/g, '');
}

function calcularDigito(base: string, pesoInicial: number): number {
  let peso = pesoInicial;
  let soma = 0;

  for (const caractere of base) {
    soma += Number(caractere) * peso;
    peso -= 1;
    // Os pesos vão de 5 (ou 6) até 2 e reiniciam em 9.
    if (peso < 2) peso = 9;
  }

  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCnpj(cnpj: string): boolean {
  const digitos = normalizarCnpj(cnpj);

  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const primeiro = calcularDigito(digitos.slice(0, 12), 5);
  if (primeiro !== Number(digitos[12])) return false;

  const segundo = calcularDigito(digitos.slice(0, 13), 6);
  return segundo === Number(digitos[13]);
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

```bash
npm test
```

Esperado: PASS, 7 testes.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/utils/cnpj.ts src/utils/cnpj.test.ts
git commit -m "test: Sobe o Vitest no backend e adiciona validacao de CNPJ" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration 006 — assinaturas, split de créditos e colunas do cadastro

**Files:**
- Create: `src/database/migrations/006_assinaturas_creditos.sql`

**Interfaces:**
- Consumes: nada
- Produces: tabela `assinaturas`, tabela `stripe_eventos_processados`, colunas `restaurantes.creditos_cota` e `restaurantes.creditos_avulsos`, colunas de cadastro em `restaurantes`, colunas `creditos_ia.origem` e `creditos_ia.estornado`, RPCs `consumir_creditos_ia(UUID, INT, VARCHAR)` e `reembolsar_creditos_ia(UUID, INT, VARCHAR, TEXT)` revisadas com as mesmas assinaturas

- [ ] **Step 1: Escrever a migration**

Criar `src/database/migrations/006_assinaturas_creditos.sql`:

```sql
-- ============================================================
-- 006_assinaturas_creditos.sql
-- Ciclo 2: cadastro e cobrança.
--
-- 1. Tabela assinaturas: espelho local do estado do Stripe.
-- 2. Split do saldo: cota mensal (reseta) x avulsos (não expiram).
-- 3. Idempotência dos webhooks do Stripe.
-- 4. Colunas de cadastro (CNPJ e endereço) em restaurantes.
--
-- ⚠️ As RPCs abaixo usam CREATE OR REPLACE mantendo EXATAMENTE a
-- mesma assinatura da 005. Mudar a assinatura criaria uma função
-- nova, e os REVOKE/GRANT da 005 não se aplicariam a ela — o buraco
-- de segurança fechado lá reabriria em silêncio.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNAS DE CADASTRO
-- ------------------------------------------------------------
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS cnpj VARCHAR(14);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS cep VARCHAR(8);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS numero VARCHAR(20);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS complemento VARCHAR(100);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS bairro VARCHAR(100);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS uf CHAR(2);

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurantes_cnpj
  ON restaurantes(cnpj) WHERE cnpj IS NOT NULL;

COMMENT ON COLUMN restaurantes.cnpj IS 'Somente dígitos, sem pontuação. Validado pelos dígitos verificadores na aplicação.';

-- ------------------------------------------------------------
-- 2. SPLIT DO SALDO DE CRÉDITOS
-- ------------------------------------------------------------
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS creditos_cota INT NOT NULL DEFAULT 0;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS creditos_avulsos INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN restaurantes.creditos_cota IS 'Cota mensal do plano. Reseta para 10000 a cada invoice.paid. Sobra não acumula.';
COMMENT ON COLUMN restaurantes.creditos_avulsos IS 'Pacotes comprados à parte. Nunca expiram. Consumidos só depois que a cota zera.';

-- Migra o saldo existente para a cota, para ninguém perder crédito.
UPDATE restaurantes
SET creditos_cota = COALESCE(creditos_disponiveis, 0)
WHERE creditos_cota = 0 AND COALESCE(creditos_disponiveis, 0) > 0;

-- creditos_disponiveis fica na tabela por ora, sem uso, para o caso de
-- ser preciso auditar a migração. Removida numa migration futura.

-- ------------------------------------------------------------
-- 3. RASTRO DE ORIGEM NO LOG DE CONSUMO
-- ------------------------------------------------------------
-- Sem isso o reembolso não sabe de qual balde debitou, e devolver um
-- crédito avulso para a cota faria o lojista perder na virada do mês
-- algo que ele pagou.
ALTER TABLE creditos_ia ADD COLUMN IF NOT EXISTS origem VARCHAR(10);
ALTER TABLE creditos_ia ADD COLUMN IF NOT EXISTS estornado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN creditos_ia.origem IS 'cota | avulso | misto — de qual saldo o consumo saiu.';

CREATE INDEX IF NOT EXISTS idx_creditos_ia_pendente_estorno
  ON creditos_ia(restaurante_id, created_at DESC)
  WHERE estornado = FALSE AND creditos_consumidos > 0;

-- ------------------------------------------------------------
-- 4. TABELA DE ASSINATURAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assinaturas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID NOT NULL UNIQUE REFERENCES restaurantes(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pendente'
      CHECK (status IN ('pendente', 'ativa', 'inadimplente', 'cancelada', 'reembolsada')),
    periodo_fim TIMESTAMP WITH TIME ZONE,
    cancelada_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_customer ON assinaturas(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_subscription ON assinaturas(stripe_subscription_id);

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assinaturas_isolation_policy ON assinaturas;
CREATE POLICY assinaturas_isolation_policy ON assinaturas
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- ------------------------------------------------------------
-- 5. IDEMPOTÊNCIA DOS WEBHOOKS DO STRIPE
-- ------------------------------------------------------------
-- O Stripe reenvia o evento quando não recebe 200. Sem esta tabela,
-- um reenvio de checkout.session.completed credita 10.000 duas vezes.
CREATE TABLE IF NOT EXISTS stripe_eventos_processados (
    event_id VARCHAR(255) PRIMARY KEY,
    tipo VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE stripe_eventos_processados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_eventos_policy ON stripe_eventos_processados;
CREATE POLICY stripe_eventos_policy ON stripe_eventos_processados
    FOR ALL
    USING (current_setting('role') = 'service_role');

-- ------------------------------------------------------------
-- 6. CONSUMO: COTA PRIMEIRO, AVULSO DEPOIS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION consumir_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cota INT;
  v_avulso INT;
  v_da_cota INT;
  v_do_avulso INT;
  v_origem VARCHAR(10);
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT creditos_cota, creditos_avulsos
    INTO v_cota, v_avulso
  FROM restaurantes
  WHERE id = p_restaurante_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF (v_cota + v_avulso) < p_qtd THEN
    RETURN FALSE;
  END IF;

  v_da_cota := LEAST(v_cota, p_qtd);
  v_do_avulso := p_qtd - v_da_cota;

  IF v_do_avulso = 0 THEN
    v_origem := 'cota';
  ELSIF v_da_cota = 0 THEN
    v_origem := 'avulso';
  ELSE
    v_origem := 'misto';
  END IF;

  UPDATE restaurantes
  SET creditos_cota = creditos_cota - v_da_cota,
      creditos_avulsos = creditos_avulsos - v_do_avulso
  WHERE id = p_restaurante_id;

  INSERT INTO creditos_ia (restaurante_id, tipo_evento, creditos_consumidos, origem)
  VALUES (p_restaurante_id, p_tipo, p_qtd, v_origem);

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------
-- 7. REEMBOLSO: VOLTA PARA O BALDE DE ONDE SAIU
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reembolsar_creditos_ia(
  p_restaurante_id UUID,
  p_qtd INT,
  p_tipo VARCHAR,
  p_motivo TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id UUID;
  v_origem VARCHAR(10);
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  PERFORM id FROM restaurantes WHERE id = p_restaurante_id FOR UPDATE;

  -- Reembolso sempre segue um consumo que acabou de acontecer na mesma
  -- requisição, então o débito mais recente ainda não estornado é o
  -- alvo certo.
  SELECT id, origem
    INTO v_log_id, v_origem
  FROM creditos_ia
  WHERE restaurante_id = p_restaurante_id
    AND estornado = FALSE
    AND creditos_consumidos > 0
  ORDER BY created_at DESC
  LIMIT 1;

  -- Sem débito correspondente (caso não esperado), devolve para a cota:
  -- é o balde conservador, porque expira.
  IF v_origem IS NULL THEN
    v_origem := 'cota';
  END IF;

  IF v_origem = 'avulso' THEN
    UPDATE restaurantes
    SET creditos_avulsos = creditos_avulsos + p_qtd
    WHERE id = p_restaurante_id;
  ELSE
    -- 'cota' e 'misto' voltam para a cota. Devolver misto inteiro para a
    -- cota erra por no máximo alguns créditos e sempre a favor do
    -- lojista no curto prazo; rastrear a divisão exata não paga o custo.
    UPDATE restaurantes
    SET creditos_cota = creditos_cota + p_qtd
    WHERE id = p_restaurante_id;
  END IF;

  IF v_log_id IS NOT NULL THEN
    UPDATE creditos_ia SET estornado = TRUE WHERE id = v_log_id;
  END IF;

  INSERT INTO creditos_ia (restaurante_id, tipo_evento, creditos_consumidos, motivo_reembolso, origem, estornado)
  VALUES (p_restaurante_id, p_tipo, -p_qtd, p_motivo, v_origem, TRUE);
END;
$$;

-- ------------------------------------------------------------
-- 8. CRÉDITO DE COTA E DE PACOTE (chamadas pelo webhook do Stripe)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resetar_cota_mensal(
  p_restaurante_id UUID,
  p_qtd INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  -- Reseta, não soma: a cota é mensal e sobra não acumula.
  UPDATE restaurantes
  SET creditos_cota = p_qtd
  WHERE id = p_restaurante_id;
END;
$$;

CREATE OR REPLACE FUNCTION creditar_pacote_avulso(
  p_restaurante_id UUID,
  p_qtd INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE restaurantes
  SET creditos_avulsos = creditos_avulsos + p_qtd
  WHERE id = p_restaurante_id;
END;
$$;

-- ------------------------------------------------------------
-- 9. PERMISSÕES (repete o padrão da 005 para as funções novas)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION resetar_cota_mensal(UUID, INT)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION creditar_pacote_avulso(UUID, INT)  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION resetar_cota_mensal(UUID, INT)      TO service_role;
GRANT EXECUTE ON FUNCTION creditar_pacote_avulso(UUID, INT)   TO service_role;
```

- [ ] **Step 2: Aplicar a migration**

Rodar o conteúdo do arquivo no SQL Editor do Supabase.

Esperado: `Success. No rows returned`. Rodar uma segunda vez e confirmar que também passa — a migration é idempotente.

- [ ] **Step 3: Conferir o resultado**

No SQL Editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'restaurantes' AND column_name IN ('cnpj','creditos_cota','creditos_avulsos','cep','uf');
```

Esperado: 5 linhas.

```sql
SELECT proname, proacl FROM pg_proc
WHERE proname IN ('consumir_creditos_ia','reembolsar_creditos_ia','resetar_cota_mensal','creditar_pacote_avulso');
```

Esperado: 4 linhas, e nenhuma com `authenticated=X` no `proacl`.

- [ ] **Step 4: Commit**

```bash
git add src/database/migrations/006_assinaturas_creditos.sql
git commit -m "feat: Cria assinaturas e separa cota mensal de creditos avulsos" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Testes das RPCs de crédito contra o Postgres real

Testar `plpgsql` com mock não prova nada — a lógica está no banco. Estes testes rodam contra o projeto Supabase de desenvolvimento, usando o client que já é dependência.

**Files:**
- Create: `src/database/creditos.test.ts`

**Interfaces:**
- Consumes: RPCs da Task 2
- Produces: nada que outra tarefa use

- [ ] **Step 1: Escrever os testes**

Criar `src/database/creditos.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { supabaseAdmin } from '../config/supabase.js';

// Restaurante descartável, recriado a cada teste para nenhum teste
// depender do saldo que outro deixou.
let restauranteId: string;

async function criarRestauranteFixture(cota: number, avulsos: number) {
  const { data, error } = await supabaseAdmin
    .from('restaurantes')
    .insert([{ nome: 'Fixture de teste', creditos_cota: cota, creditos_avulsos: avulsos }])
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

async function saldo(id: string) {
  const { data } = await supabaseAdmin
    .from('restaurantes')
    .select('creditos_cota, creditos_avulsos')
    .eq('id', id)
    .single();
  return data as { creditos_cota: number; creditos_avulsos: number };
}

beforeEach(async () => {
  restauranteId = await criarRestauranteFixture(10, 5);
});

afterAll(async () => {
  await supabaseAdmin.from('restaurantes').delete().eq('nome', 'Fixture de teste');
});

describe('consumir_creditos_ia', () => {
  it('debita da cota enquanto ela cobre o consumo', async () => {
    const { data } = await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 8, p_tipo: 'audio',
    });

    expect(data).toBe(true);
    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 2, creditos_avulsos: 5 });
  });

  it('completa com avulso quando a cota não cobre sozinha', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 12, p_tipo: 'audio',
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 0, creditos_avulsos: 3 });
  });

  it('recusa quando os dois saldos somados não cobrem', async () => {
    const { data } = await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 16, p_tipo: 'audio',
    });

    expect(data).toBe(false);
    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });

  it('registra a origem no log de consumo', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 12, p_tipo: 'audio',
    });

    const { data } = await supabaseAdmin
      .from('creditos_ia')
      .select('origem')
      .eq('restaurante_id', restauranteId)
      .single();

    expect(data?.origem).toBe('misto');
  });
});

describe('reembolsar_creditos_ia', () => {
  it('devolve ao avulso o que saiu do avulso', async () => {
    // Zera a cota primeiro, para o consumo sair inteiro do avulso.
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 10, p_tipo: 'texto',
    });
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 3, p_tipo: 'texto',
    });

    await supabaseAdmin.rpc('reembolsar_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 3, p_tipo: 'texto', p_motivo: 'teste',
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 0, creditos_avulsos: 5 });
  });

  it('devolve à cota o que saiu da cota', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 4, p_tipo: 'texto',
    });
    await supabaseAdmin.rpc('reembolsar_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 4, p_tipo: 'texto', p_motivo: 'teste',
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });
});

describe('resetar_cota_mensal', () => {
  it('reseta a cota sem somar e sem tocar no avulso', async () => {
    await supabaseAdmin.rpc('consumir_creditos_ia', {
      p_restaurante_id: restauranteId, p_qtd: 6, p_tipo: 'texto',
    });

    await supabaseAdmin.rpc('resetar_cota_mensal', {
      p_restaurante_id: restauranteId, p_qtd: 10,
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 5 });
  });
});

describe('creditar_pacote_avulso', () => {
  it('soma ao avulso sem tocar na cota', async () => {
    await supabaseAdmin.rpc('creditar_pacote_avulso', {
      p_restaurante_id: restauranteId, p_qtd: 2500,
    });

    expect(await saldo(restauranteId)).toEqual({ creditos_cota: 10, creditos_avulsos: 2505 });
  });
});
```

- [ ] **Step 2: Rodar**

```bash
npm test -- src/database/creditos.test.ts
```

Esperado: PASS, 8 testes. Se falhar com `function does not exist`, a migration da Task 2 não foi aplicada no projeto apontado pelo `.env`.

- [ ] **Step 3: Commit**

```bash
git add src/database/creditos.test.ts
git commit -m "test: Cobre o split de creditos entre cota e avulso" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Custo do áudio de 3 para 8 créditos

A landing vende 8 créditos por áudio; o código cobra 3. Alinhar a cobrança com o que foi vendido.

**Files:**
- Modify: `src/server.ts:129`

**Interfaces:**
- Consumes: nada
- Produces: nada

- [ ] **Step 1: Alterar o custo**

Em `src/server.ts`, trocar:

```ts
const custoCreditos = messageType === 'audio' ? 3 : 1;
```

por:

```ts
// 8 para áudio, alinhado com o que a landing vende. O número reflete o
// custo real de STT + LLM + TTS; o TTS ainda não está ligado (ciclo 3),
// mas a cota já é dimensionada para ele.
const custoCreditos = messageType === 'audio' ? 8 : 1;
```

- [ ] **Step 2: Rodar a suíte**

```bash
npm test
```

Esperado: PASS, sem regressão.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "fix: Cobra 8 creditos por audio, como a landing anuncia" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Rota de cadastro

**Files:**
- Modify: `src/server.ts` (rota nova, depois do bloco de refresh)
- Create: `src/services/cadastro/criar-conta.ts`
- Create: `src/services/cadastro/criar-conta.test.ts`

**Interfaces:**
- Consumes: `validarCnpj`, `normalizarCnpj` de `src/utils/cnpj.js` (Task 1); tabela `assinaturas` (Task 2)
- Produces: `POST /api/auth/cadastro`, que aceita `{ nome, email, senha, restauranteNome, cnpj, cep, logradouro, numero, complemento, bairro, cidade, uf }` e devolve `{ success: true, token, expiresIn }`. Também exporta `validarPayloadCadastro(body: unknown): { ok: true; dados: DadosCadastro } | { ok: false; erro: string; status: number }`

- [ ] **Step 1: Escrever o teste da validação de payload**

Criar `src/services/cadastro/criar-conta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validarPayloadCadastro } from './criar-conta.js';

const valido = {
  nome: 'Marina Souza',
  email: 'marina@pizzaria.com.br',
  senha: 'senhaforte123',
  restauranteNome: 'Pizzaria do Bairro',
  cnpj: '11.222.333/0001-81',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  complemento: '',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
};

describe('validarPayloadCadastro', () => {
  it('aceita um payload completo e normaliza CNPJ e CEP', () => {
    const r = validarPayloadCadastro(valido);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.cnpj).toBe('11222333000181');
      expect(r.dados.cep).toBe('01310100');
    }
  });

  it('normaliza o e-mail para minúsculas e sem espaços', () => {
    const r = validarPayloadCadastro({ ...valido, email: '  Marina@Pizzaria.com.BR ' });
    expect(r.ok && r.dados.email).toBe('marina@pizzaria.com.br');
  });

  it('recusa CNPJ com dígito verificador errado', () => {
    const r = validarPayloadCadastro({ ...valido, cnpj: '11222333000182' });
    expect(r).toEqual({ ok: false, erro: 'CNPJ inválido.', status: 400 });
  });

  it('recusa senha curta demais', () => {
    const r = validarPayloadCadastro({ ...valido, senha: '1234567' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe('A senha precisa ter ao menos 8 caracteres.');
  });

  it('recusa e-mail sem formato de e-mail', () => {
    const r = validarPayloadCadastro({ ...valido, email: 'marina-arroba-pizzaria' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe('E-mail inválido.');
  });

  it('recusa UF que não existe', () => {
    const r = validarPayloadCadastro({ ...valido, uf: 'XX' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toBe('UF inválida.');
  });

  it('recusa campo obrigatório ausente', () => {
    const { numero, ...semNumero } = valido;
    const r = validarPayloadCadastro(semNumero);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('aceita complemento vazio', () => {
    const r = validarPayloadCadastro({ ...valido, complemento: '' });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npm test -- src/services/cadastro/criar-conta.test.ts`
Esperado: FAIL — `Failed to resolve import "./criar-conta.js"`.

- [ ] **Step 3: Implementar a validação**

Criar `src/services/cadastro/criar-conta.ts`:

```ts
import { z } from 'zod';
import { validarCnpj, normalizarCnpj } from '../../utils/cnpj.js';

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

const schema = z.object({
  nome: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email({ message: 'E-mail inválido.' }),
  senha: z.string().min(8, { message: 'A senha precisa ter ao menos 8 caracteres.' }),
  restauranteNome: z.string().trim().min(2),
  cnpj: z.string().refine(validarCnpj, { message: 'CNPJ inválido.' }),
  cep: z.string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, { message: 'CEP inválido.' }),
  logradouro: z.string().trim().min(2),
  numero: z.string().trim().min(1),
  complemento: z.string().trim().optional().default(''),
  bairro: z.string().trim().min(2),
  cidade: z.string().trim().min(2),
  uf: z.string().trim().toUpperCase()
    .refine((v) => (UFS as readonly string[]).includes(v), { message: 'UF inválida.' }),
});

export type DadosCadastro = z.infer<typeof schema>;

export type ResultadoValidacao =
  | { ok: true; dados: DadosCadastro }
  | { ok: false; erro: string; status: number };

export function validarPayloadCadastro(body: unknown): ResultadoValidacao {
  const r = schema.safeParse(body);

  if (!r.success) {
    // A primeira mensagem basta: o formulário do front valida campo a
    // campo, então isto é a última linha de defesa, não a experiência.
    const primeiro = r.error.issues[0];
    const temMensagemPropria = primeiro?.message && !primeiro.message.startsWith('String must');

    return {
      ok: false,
      erro: temMensagemPropria ? primeiro.message : 'Dados de cadastro incompletos ou inválidos.',
      status: 400,
    };
  }

  return { ok: true, dados: { ...r.data, cnpj: normalizarCnpj(r.data.cnpj) } };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npm test -- src/services/cadastro/criar-conta.test.ts`
Esperado: PASS, 8 testes.

- [ ] **Step 5: Adicionar a rota em `src/server.ts`**

Acrescentar ao bloco de imports do topo:

```ts
import { validarPayloadCadastro } from './services/cadastro/criar-conta.js';
```

Logo depois do bloco `/api/auth/refresh`, acrescentar:

```ts
// ------------------------------------------------------------------
// 3.2 CADASTRO DE NOVO RESTAURANTE
// ------------------------------------------------------------------
// A conta nasce antes do pagamento, com assinatura 'pendente'. Quem
// abandona o Checkout retoma pelo login, sem recadastrar.
app.post('/api/auth/cadastro', async (req, res) => {
  const validacao = validarPayloadCadastro(req.body);

  if (!validacao.ok) {
    return res.status(validacao.status).json({ success: false, error: validacao.erro });
  }

  const d = validacao.dados;

  // Unicidade antes de criar qualquer coisa, para não deixar
  // restaurante órfão quando o insert seguinte falhar.
  const { data: emailExistente } = await supabaseAdmin
    .from('usuarios').select('id').eq('email', d.email).maybeSingle();

  if (emailExistente) {
    return res.status(409).json({ success: false, error: 'Já existe uma conta com este e-mail.' });
  }

  const { data: cnpjExistente } = await supabaseAdmin
    .from('restaurantes').select('id').eq('cnpj', d.cnpj).maybeSingle();

  if (cnpjExistente) {
    return res.status(409).json({ success: false, error: 'Já existe uma conta com este CNPJ.' });
  }

  const { data: restaurante, error: erroRestaurante } = await supabaseAdmin
    .from('restaurantes')
    .insert([{
      nome: d.restauranteNome,
      cnpj: d.cnpj,
      cep: d.cep,
      logradouro: d.logradouro,
      numero: d.numero,
      complemento: d.complemento || null,
      bairro: d.bairro,
      cidade: d.cidade,
      uf: d.uf,
      ativo: true,
    }])
    .select('id')
    .single();

  if (erroRestaurante || !restaurante) {
    console.error('[Cadastro] Falha ao criar restaurante:', erroRestaurante);
    return res.status(500).json({ success: false, error: 'Não foi possível criar a conta. Tente novamente.' });
  }

  const senhaHash = await bcrypt.hash(d.senha, 10);

  const { data: usuario, error: erroUsuario } = await supabaseAdmin
    .from('usuarios')
    .insert([{ restaurante_id: restaurante.id, email: d.email, senha_hash: senhaHash, nome: d.nome }])
    .select('id')
    .single();

  if (erroUsuario || !usuario) {
    console.error('[Cadastro] Falha ao criar usuário, revertendo restaurante:', erroUsuario);
    await supabaseAdmin.from('restaurantes').delete().eq('id', restaurante.id);
    return res.status(500).json({ success: false, error: 'Não foi possível criar a conta. Tente novamente.' });
  }

  const { error: erroAssinatura } = await supabaseAdmin
    .from('assinaturas')
    .insert([{ restaurante_id: restaurante.id, status: 'pendente' }]);

  if (erroAssinatura) {
    console.error('[Cadastro] Falha ao criar assinatura, revertendo:', erroAssinatura);
    await supabaseAdmin.from('restaurantes').delete().eq('id', restaurante.id);
    return res.status(500).json({ success: false, error: 'Não foi possível criar a conta. Tente novamente.' });
  }

  const token = jwt.sign(
    {
      sub: restaurante.id,
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: { usuario_id: usuario.id, restaurante_id: restaurante.id, nome: d.nome },
    },
    getJwtSecret(),
    { expiresIn: '12h' }
  );

  return res.status(201).json({ success: true, token, expiresIn: 43200 });
});
```

`usuarios` e `assinaturas` têm `ON DELETE CASCADE` para `restaurantes`, então apagar o restaurante limpa o que veio depois.

- [ ] **Step 6: Testar a rota manualmente**

Com `npm run dev` rodando:

```bash
curl -s -X POST http://localhost:3000/api/auth/cadastro -H "Content-Type: application/json" -d '{"nome":"Marina","email":"teste@exemplo.com","senha":"senhaforte123","restauranteNome":"Pizzaria Teste","cnpj":"11222333000181","cep":"01310100","logradouro":"Av Paulista","numero":"1000","bairro":"Bela Vista","cidade":"Sao Paulo","uf":"SP"}'
```

Esperado: `{"success":true,"token":"eyJ...","expiresIn":43200}`. Repetir o comando: esperado 409 com "Já existe uma conta com este e-mail."

- [ ] **Step 7: Commit**

```bash
git add src/services/cadastro/ src/server.ts
git commit -m "feat: Cria a rota de cadastro de restaurante" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Configuração do Stripe e catálogo de pacotes

**Files:**
- Modify: `src/config/env.ts`
- Modify: `package.json`, `README.md`
- Create: `src/services/billing/stripe-client.ts`
- Create: `src/services/billing/pacotes.ts`
- Create: `src/services/billing/pacotes.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `getStripe(): Stripe` e `getWebhookSecret(): string` de `stripe-client.js`; `PACOTES: Pacote[]`, `pacotePorId(id: string): Pacote | undefined` e `pacotePorPriceId(priceId: string): Pacote | undefined` de `pacotes.js`, onde `Pacote = { id: string; creditos: number; precoCentavos: number; rotulo: string; priceId: string }`

- [ ] **Step 1: Instalar o SDK**

```bash
npm install stripe
```

- [ ] **Step 2: Declarar as variáveis de ambiente**

Em `src/config/env.ts`, dentro do `envSchema`, acrescentar:

```ts
  // Opcionais no schema para o backend subir em máquina sem Stripe
  // configurado. getStripe() falha com mensagem clara na hora de usar —
  // melhor do que impedir todo o resto do sistema de rodar.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ASSINATURA: z.string().optional(),
  STRIPE_PRICE_CREDITOS_2500: z.string().optional(),
  STRIPE_PRICE_CREDITOS_5000: z.string().optional(),
  STRIPE_PRICE_CREDITOS_10000: z.string().optional(),
  APP_URL: z.string().url().default('http://localhost:5173'),
```

- [ ] **Step 3: Criar o client**

Criar `src/services/billing/stripe-client.ts`:

```ts
import Stripe from 'stripe';
import { env } from '../../config/env.js';

let instancia: Stripe | null = null;

/** Único ponto do sistema que conhece a chave secreta do Stripe. */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY não configurada. Cobrança indisponível.');
  }

  if (!instancia) {
    instancia = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return instancia;
}

export function getWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada. Webhook indisponível.');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}
```

- [ ] **Step 4: Escrever o teste do catálogo**

Criar `src/services/billing/pacotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PACOTES, pacotePorId, pacotePorPriceId } from './pacotes.js';

describe('PACOTES', () => {
  it('tem os três pacotes acordados', () => {
    expect(PACOTES.map((p) => [p.creditos, p.precoCentavos])).toEqual([
      [2500, 5990],
      [5000, 10990],
      [10000, 19990],
    ]);
  });

  // Se o avulso ficar mais barato por crédito que o plano, vale mais a
  // pena comprar avulso do que assinar — e o negócio se canibaliza.
  it('mantém todo pacote mais caro por crédito que o plano', () => {
    const precoPorCreditoDoPlano = 17999 / 10000;

    for (const pacote of PACOTES) {
      expect(pacote.precoCentavos / pacote.creditos).toBeGreaterThan(precoPorCreditoDoPlano);
    }
  });
});

describe('pacotePorId', () => {
  it('encontra pelo id', () => {
    expect(pacotePorId('creditos_2500')?.creditos).toBe(2500);
  });

  it('devolve undefined para id desconhecido', () => {
    expect(pacotePorId('creditos_999')).toBeUndefined();
  });
});

describe('pacotePorPriceId', () => {
  it('encontra o pacote pelo price id configurado', () => {
    process.env.STRIPE_PRICE_CREDITOS_5000 = 'price_teste_5000';
    expect(pacotePorPriceId('price_teste_5000')?.creditos).toBe(5000);
  });

  it('devolve undefined para price id desconhecido', () => {
    expect(pacotePorPriceId('price_que_nao_existe')).toBeUndefined();
  });

  // Sem esta guarda, um evento do Stripe sem price id casaria com
  // qualquer pacote cujo env var não estivesse configurado.
  it('devolve undefined para price id vazio', () => {
    expect(pacotePorPriceId('')).toBeUndefined();
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

Rodar: `npm test -- src/services/billing/pacotes.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 6: Implementar o catálogo**

Criar `src/services/billing/pacotes.ts`:

```ts
export interface Pacote {
  id: string;
  creditos: number;
  precoCentavos: number;
  rotulo: string;
  priceId: string;
}

const DEFINICOES = [
  { id: 'creditos_2500', creditos: 2500, precoCentavos: 5990, rotulo: '2.500 créditos', envVar: 'STRIPE_PRICE_CREDITOS_2500' },
  { id: 'creditos_5000', creditos: 5000, precoCentavos: 10990, rotulo: '5.000 créditos', envVar: 'STRIPE_PRICE_CREDITOS_5000' },
  { id: 'creditos_10000', creditos: 10000, precoCentavos: 19990, rotulo: '10.000 créditos', envVar: 'STRIPE_PRICE_CREDITOS_10000' },
] as const;

// O price id é lido do ambiente a cada acesso, não congelado no import:
// trocar de conta Stripe (teste para produção) não exige recompilar.
export const PACOTES: Pacote[] = DEFINICOES.map((d) => ({
  id: d.id,
  creditos: d.creditos,
  precoCentavos: d.precoCentavos,
  rotulo: d.rotulo,
  get priceId() {
    return process.env[d.envVar] || '';
  },
})) as Pacote[];

export function pacotePorId(id: string): Pacote | undefined {
  return PACOTES.find((p) => p.id === id);
}

export function pacotePorPriceId(priceId: string): Pacote | undefined {
  if (!priceId) return undefined;
  return PACOTES.find((p) => p.priceId === priceId);
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Rodar: `npm test -- src/services/billing/pacotes.test.ts`
Esperado: PASS, 6 testes.

- [ ] **Step 8: Documentar as variáveis no README**

Acrescentar ao passo 2 de "Como Rodar o Projeto" em `README.md`:

```markdown
   Para cobrança, configurar também: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_ASSINATURA`, `STRIPE_PRICE_CREDITOS_2500`, `STRIPE_PRICE_CREDITOS_5000`,
   `STRIPE_PRICE_CREDITOS_10000` e `APP_URL`.
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/config/env.ts src/services/billing/ README.md
git commit -m "feat: Configura o SDK do Stripe e o catalogo de pacotes avulsos" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Repositório de assinaturas e criação das sessões de Checkout

**Files:**
- Create: `src/services/billing/assinatura-repo.ts`
- Create: `src/services/billing/checkout.ts`
- Create: `src/services/billing/checkout.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `getStripe` (Task 6), `PACOTES`/`pacotePorId` (Task 6), tabela `assinaturas` (Task 2)
- Produces:
  - De `assinatura-repo.js`: `type StatusAssinatura = 'pendente' | 'ativa' | 'inadimplente' | 'cancelada' | 'reembolsada'`; `type Assinatura = { restauranteId: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null; status: StatusAssinatura; periodoFim: string | null }`; `buscarAssinatura(restauranteId: string): Promise<Assinatura | null>`; `buscarPorCustomerId(customerId: string): Promise<Assinatura | null>`; `salvarCustomerId(restauranteId: string, customerId: string): Promise<void>`; `atualizarStatus(restauranteId: string, campos: Partial<Assinatura>): Promise<void>`
  - De `checkout.js`: `criarSessaoAssinatura(restauranteId: string, email: string): Promise<string>`; `criarSessaoPacote(restauranteId: string, pacoteId: string): Promise<string>`; `criarSessaoPortal(restauranteId: string): Promise<string>`. Todas devolvem a URL para redirecionar
  - Rotas `POST /api/billing/checkout`, `POST /api/billing/pacote` e `POST /api/billing/portal`

- [ ] **Step 1: Implementar o repositório**

Criar `src/services/billing/assinatura-repo.ts`:

```ts
import { supabaseAdmin } from '../../config/supabase.js';

export type StatusAssinatura =
  | 'pendente' | 'ativa' | 'inadimplente' | 'cancelada' | 'reembolsada';

export interface Assinatura {
  restauranteId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: StatusAssinatura;
  periodoFim: string | null;
}

interface LinhaAssinatura {
  restaurante_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: StatusAssinatura;
  periodo_fim: string | null;
}

const COLUNAS = 'restaurante_id, stripe_customer_id, stripe_subscription_id, status, periodo_fim';

function paraDominio(linha: LinhaAssinatura): Assinatura {
  return {
    restauranteId: linha.restaurante_id,
    stripeCustomerId: linha.stripe_customer_id,
    stripeSubscriptionId: linha.stripe_subscription_id,
    status: linha.status,
    periodoFim: linha.periodo_fim,
  };
}

export async function buscarAssinatura(restauranteId: string): Promise<Assinatura | null> {
  const { data } = await supabaseAdmin
    .from('assinaturas')
    .select(COLUNAS)
    .eq('restaurante_id', restauranteId)
    .maybeSingle();

  return data ? paraDominio(data as LinhaAssinatura) : null;
}

export async function buscarPorCustomerId(customerId: string): Promise<Assinatura | null> {
  const { data } = await supabaseAdmin
    .from('assinaturas')
    .select(COLUNAS)
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data ? paraDominio(data as LinhaAssinatura) : null;
}

export async function salvarCustomerId(restauranteId: string, customerId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('assinaturas')
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}

export async function atualizarStatus(
  restauranteId: string,
  campos: Partial<Pick<Assinatura, 'status' | 'stripeSubscriptionId' | 'periodoFim'>> & { canceladaEm?: string },
): Promise<void> {
  const linha: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (campos.status !== undefined) linha.status = campos.status;
  if (campos.stripeSubscriptionId !== undefined) linha.stripe_subscription_id = campos.stripeSubscriptionId;
  if (campos.periodoFim !== undefined) linha.periodo_fim = campos.periodoFim;
  if (campos.canceladaEm !== undefined) linha.cancelada_em = campos.canceladaEm;

  const { error } = await supabaseAdmin
    .from('assinaturas')
    .update(linha)
    .eq('restaurante_id', restauranteId);

  if (error) throw error;
}
```

- [ ] **Step 2: Escrever o teste do checkout**

Criar `src/services/billing/checkout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const criarSessaoMock = vi.fn();
const criarCustomerMock = vi.fn();
const criarPortalMock = vi.fn();

vi.mock('./stripe-client.js', () => ({
  getStripe: () => ({
    customers: { create: criarCustomerMock },
    checkout: { sessions: { create: criarSessaoMock } },
    billingPortal: { sessions: { create: criarPortalMock } },
  }),
}));

const buscarAssinaturaMock = vi.fn();
const salvarCustomerIdMock = vi.fn();

vi.mock('./assinatura-repo.js', () => ({
  buscarAssinatura: (...args: unknown[]) => buscarAssinaturaMock(...args),
  salvarCustomerId: (...args: unknown[]) => salvarCustomerIdMock(...args),
}));

const { criarSessaoAssinatura, criarSessaoPacote, criarSessaoPortal } = await import('./checkout.js');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_ASSINATURA = 'price_assinatura';
  process.env.STRIPE_PRICE_CREDITOS_5000 = 'price_5000';
  criarSessaoMock.mockResolvedValue({ url: 'https://checkout.stripe.com/sessao' });
  criarCustomerMock.mockResolvedValue({ id: 'cus_novo' });
  criarPortalMock.mockResolvedValue({ url: 'https://billing.stripe.com/sessao' });
});

describe('criarSessaoAssinatura', () => {
  it('cria o Customer na primeira vez e guarda o id', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: null });

    const url = await criarSessaoAssinatura('rest-1', 'marina@pizzaria.com.br');

    expect(criarCustomerMock).toHaveBeenCalledOnce();
    expect(salvarCustomerIdMock).toHaveBeenCalledWith('rest-1', 'cus_novo');
    expect(url).toBe('https://checkout.stripe.com/sessao');
  });

  it('reaproveita o Customer quando já existe', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: 'cus_antigo' });

    await criarSessaoAssinatura('rest-1', 'marina@pizzaria.com.br');

    expect(criarCustomerMock).not.toHaveBeenCalled();
    expect(criarSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_antigo', mode: 'subscription' }),
    );
  });

  it('manda o restaurante_id na sessão, para o webhook saber de quem é', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: 'cus_1' });

    await criarSessaoAssinatura('rest-42', 'marina@pizzaria.com.br');

    expect(criarSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: 'rest-42',
        metadata: expect.objectContaining({ restaurante_id: 'rest-42' }),
      }),
    );
  });

  // O Stripe NÃO impede duas assinaturas do mesmo preço para o mesmo
  // Customer. Sem esta trava, o lojista é cobrado em dobro.
  it('recusa quando a assinatura já está ativa', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    await expect(criarSessaoAssinatura('rest-1', 'marina@pizzaria.com.br'))
      .rejects.toThrow('Esta conta já tem uma assinatura ativa.');

    expect(criarSessaoMock).not.toHaveBeenCalled();
  });
});

describe('criarSessaoPacote', () => {
  it('abre a sessão em modo payment com o price do pacote', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    await criarSessaoPacote('rest-1', 'creditos_5000');

    expect(criarSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: [{ price: 'price_5000', quantity: 1 }],
      }),
    );
  });

  it('recusa pacote que não existe no catálogo', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    await expect(criarSessaoPacote('rest-1', 'creditos_999'))
      .rejects.toThrow('Pacote inválido.');
  });

  // Comprar crédito sem assinatura deixaria o lojista com saldo e sem
  // painel para usá-lo.
  it('recusa quem não tem assinatura ativa', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: 'cus_1' });

    await expect(criarSessaoPacote('rest-1', 'creditos_5000'))
      .rejects.toThrow('É preciso ter uma assinatura ativa para comprar créditos.');
  });
});

describe('criarSessaoPortal', () => {
  it('abre o portal para o Customer da conta', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'ativa', stripeCustomerId: 'cus_1' });

    const url = await criarSessaoPortal('rest-1');

    expect(criarPortalMock).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }));
    expect(url).toBe('https://billing.stripe.com/sessao');
  });

  it('recusa quando a conta nunca chegou a ter Customer', async () => {
    buscarAssinaturaMock.mockResolvedValue({ status: 'pendente', stripeCustomerId: null });

    await expect(criarSessaoPortal('rest-1')).rejects.toThrow('Nenhuma assinatura para gerenciar.');
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Rodar: `npm test -- src/services/billing/checkout.test.ts`
Esperado: FAIL — `Failed to resolve import "./checkout.js"`.

- [ ] **Step 4: Implementar o checkout**

Criar `src/services/billing/checkout.ts`:

```ts
import { env } from '../../config/env.js';
import { getStripe } from './stripe-client.js';
import { buscarAssinatura, salvarCustomerId } from './assinatura-repo.js';
import { pacotePorId } from './pacotes.js';

async function garantirCustomer(restauranteId: string, email?: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  if (!assinatura) {
    throw new Error('Conta sem registro de assinatura.');
  }

  if (assinatura.stripeCustomerId) {
    return assinatura.stripeCustomerId;
  }

  const customer = await getStripe().customers.create({
    email,
    metadata: { restaurante_id: restauranteId },
  });

  await salvarCustomerId(restauranteId, customer.id);
  return customer.id;
}

export async function criarSessaoAssinatura(restauranteId: string, email: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  // O Stripe aceita duas assinaturas do mesmo preço para o mesmo
  // Customer sem reclamar. A trava contra cobrança dupla é esta.
  if (assinatura?.status === 'ativa') {
    throw new Error('Esta conta já tem uma assinatura ativa.');
  }

  if (!env.STRIPE_PRICE_ASSINATURA) {
    throw new Error('STRIPE_PRICE_ASSINATURA não configurada.');
  }

  const customerId = await garantirCustomer(restauranteId, email);

  const sessao = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: env.STRIPE_PRICE_ASSINATURA, quantity: 1 }],
    client_reference_id: restauranteId,
    metadata: { restaurante_id: restauranteId },
    subscription_data: { metadata: { restaurante_id: restauranteId } },
    locale: 'pt-BR',
    success_url: `${env.APP_URL}/assinatura/confirmando?sessao={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/assinatura/pagamento`,
  });

  if (!sessao.url) throw new Error('O Stripe não devolveu a URL do checkout.');
  return sessao.url;
}

export async function criarSessaoPacote(restauranteId: string, pacoteId: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  if (assinatura?.status !== 'ativa') {
    throw new Error('É preciso ter uma assinatura ativa para comprar créditos.');
  }

  const pacote = pacotePorId(pacoteId);

  if (!pacote || !pacote.priceId) {
    throw new Error('Pacote inválido.');
  }

  const customerId = await garantirCustomer(restauranteId);

  const sessao = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: pacote.priceId, quantity: 1 }],
    client_reference_id: restauranteId,
    metadata: { restaurante_id: restauranteId, pacote_id: pacote.id },
    locale: 'pt-BR',
    success_url: `${env.APP_URL}/app/creditos?compra=ok`,
    cancel_url: `${env.APP_URL}/app/creditos`,
  });

  if (!sessao.url) throw new Error('O Stripe não devolveu a URL do checkout.');
  return sessao.url;
}

export async function criarSessaoPortal(restauranteId: string): Promise<string> {
  const assinatura = await buscarAssinatura(restauranteId);

  if (!assinatura?.stripeCustomerId) {
    throw new Error('Nenhuma assinatura para gerenciar.');
  }

  const sessao = await getStripe().billingPortal.sessions.create({
    customer: assinatura.stripeCustomerId,
    return_url: `${env.APP_URL}/app/assinatura`,
  });

  return sessao.url;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Rodar: `npm test -- src/services/billing/checkout.test.ts`
Esperado: PASS, 9 testes.

- [ ] **Step 6: Extrair o middleware de autenticação**

`src/server.ts` repete a leitura do JWT em cada rota do painel. As rotas de billing precisam do mesmo, então vale extrair agora. Criar `src/middleware/autenticar.ts`:

```ts
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/env.js';

declare global {
  namespace Express {
    interface Request {
      restauranteId?: string;
      usuarioId?: string;
    }
  }
}

export function autenticar(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token não fornecido.' });
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], getJwtSecret()) as jwt.JwtPayload;
    req.restauranteId = decoded.sub as string;
    req.usuarioId = decoded.user_metadata?.usuario_id as string | undefined;
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado.' });
  }
}
```

- [ ] **Step 7: Adicionar as rotas em `src/server.ts`**

Imports no topo:

```ts
import { autenticar } from './middleware/autenticar.js';
import { criarSessaoAssinatura, criarSessaoPacote, criarSessaoPortal } from './services/billing/checkout.js';
```

Depois da rota de cadastro:

```ts
// ------------------------------------------------------------------
// 3.3 COBRANÇA: CHECKOUT, PACOTES E PORTAL
// ------------------------------------------------------------------
app.post('/api/billing/checkout', autenticar, async (req, res) => {
  try {
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('email')
      .eq('restaurante_id', req.restauranteId)
      .limit(1)
      .maybeSingle();

    const url = await criarSessaoAssinatura(req.restauranteId!, usuario?.email || '');
    return res.json({ success: true, url });
  } catch (erro: any) {
    console.error('[Billing] Falha ao criar checkout:', erro);
    return res.status(400).json({ success: false, error: erro.message });
  }
});

app.post('/api/billing/pacote', autenticar, async (req, res) => {
  try {
    const url = await criarSessaoPacote(req.restauranteId!, req.body?.pacoteId);
    return res.json({ success: true, url });
  } catch (erro: any) {
    console.error('[Billing] Falha ao criar compra de pacote:', erro);
    return res.status(400).json({ success: false, error: erro.message });
  }
});

app.post('/api/billing/portal', autenticar, async (req, res) => {
  try {
    const url = await criarSessaoPortal(req.restauranteId!);
    return res.json({ success: true, url });
  } catch (erro: any) {
    console.error('[Billing] Falha ao abrir o portal:', erro);
    return res.status(400).json({ success: false, error: erro.message });
  }
});
```

- [ ] **Step 8: Rodar a suíte inteira**

Rodar: `npm test`
Esperado: PASS em tudo.

- [ ] **Step 9: Commit**

```bash
git add src/services/billing/ src/middleware/ src/server.ts
git commit -m "feat: Cria as sessoes de checkout, pacote e portal do Stripe" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Webhook do Stripe

O único código que escreve estado de assinatura. Idempotente por construção.

**Files:**
- Create: `src/services/billing/webhook-handler.ts`
- Create: `src/services/billing/webhook-handler.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `atualizarStatus`, `buscarPorCustomerId` (Task 7); `pacotePorId` (Task 6); RPCs `resetar_cota_mensal` e `creditar_pacote_avulso` (Task 2)
- Produces: `processarEvento(evento: Stripe.Event): Promise<void>` e `registrarEventoSeNovo(eventId: string, tipo: string): Promise<boolean>` de `webhook-handler.js`; rota `POST /api/webhooks/stripe`

- [ ] **Step 1: Escrever o teste**

Criar `src/services/billing/webhook-handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const atualizarStatusMock = vi.fn();
const buscarPorCustomerIdMock = vi.fn();

vi.mock('./assinatura-repo.js', () => ({
  atualizarStatus: (...a: unknown[]) => atualizarStatusMock(...a),
  buscarPorCustomerId: (...a: unknown[]) => buscarPorCustomerIdMock(...a),
}));

const rpcMock = vi.fn();

vi.mock('../../config/supabase.js', () => ({
  supabaseAdmin: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({ insert: () => ({ error: null }) }),
  },
}));

const { processarEvento, CREDITOS_DA_COTA } = await import('./webhook-handler.js');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_CREDITOS_5000 = 'price_5000';
  rpcMock.mockResolvedValue({ data: null, error: null });
  buscarPorCustomerIdMock.mockResolvedValue({ restauranteId: 'rest-1' });
});

describe('checkout.session.completed em modo subscription', () => {
  const evento = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'subscription',
        client_reference_id: 'rest-1',
        customer: 'cus_1',
        subscription: 'sub_1',
        metadata: { restaurante_id: 'rest-1' },
      },
    },
  } as any;

  it('ativa a assinatura e guarda o id da subscription', async () => {
    await processarEvento(evento);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      status: 'ativa',
      stripeSubscriptionId: 'sub_1',
    }));
  });

  it('credita a cota cheia', async () => {
    await processarEvento(evento);

    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', {
      p_restaurante_id: 'rest-1',
      p_qtd: CREDITOS_DA_COTA,
    });
  });
});

describe('checkout.session.completed em modo payment', () => {
  it('soma o pacote ao saldo avulso, sem tocar na cota', async () => {
    await processarEvento({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          client_reference_id: 'rest-1',
          customer: 'cus_1',
          metadata: { restaurante_id: 'rest-1', pacote_id: 'creditos_5000' },
        },
      },
    } as any);

    expect(rpcMock).toHaveBeenCalledWith('creditar_pacote_avulso', {
      p_restaurante_id: 'rest-1',
      p_qtd: 5000,
    });
    expect(atualizarStatusMock).not.toHaveBeenCalled();
  });
});

describe('invoice.paid', () => {
  // Sem olhar o billing_reason, a primeira fatura credita a cota duas
  // vezes: uma no checkout.session.completed e outra aqui.
  it('ignora a primeira fatura, que o checkout já creditou', async () => {
    await processarEvento({
      id: 'evt_3',
      type: 'invoice.paid',
      data: { object: { billing_reason: 'subscription_create', customer: 'cus_1' } },
    } as any);

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('reseta a cota na renovação', async () => {
    await processarEvento({
      id: 'evt_4',
      type: 'invoice.paid',
      data: {
        object: {
          billing_reason: 'subscription_cycle',
          customer: 'cus_1',
          period_end: 1793491200,
        },
      },
    } as any);

    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', {
      p_restaurante_id: 'rest-1',
      p_qtd: CREDITOS_DA_COTA,
    });
    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'ativa' }));
  });
});

describe('invoice.payment_failed', () => {
  it('marca inadimplente sem zerar créditos', async () => {
    await processarEvento({
      id: 'evt_5',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', { status: 'inadimplente' });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('customer.subscription.deleted', () => {
  it('cancela e zera a cota, preservando o avulso', async () => {
    await processarEvento({
      id: 'evt_6',
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'cancelada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });
});

describe('charge.refunded', () => {
  it('marca reembolsada e zera a cota', async () => {
    await processarEvento({
      id: 'evt_7',
      type: 'charge.refunded',
      data: { object: { customer: 'cus_1' } },
    } as any);

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({ status: 'reembolsada' }));
    expect(rpcMock).toHaveBeenCalledWith('resetar_cota_mensal', { p_restaurante_id: 'rest-1', p_qtd: 0 });
  });
});

describe('evento de tipo não tratado', () => {
  it('não faz nada e não quebra', async () => {
    await processarEvento({ id: 'evt_8', type: 'customer.updated', data: { object: {} } } as any);

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('restaurante não encontrado', () => {
  it('não escreve nada quando o customer é desconhecido', async () => {
    buscarPorCustomerIdMock.mockResolvedValue(null);

    await processarEvento({
      id: 'evt_9',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_fantasma' } },
    } as any);

    expect(atualizarStatusMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npm test -- src/services/billing/webhook-handler.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o handler**

Criar `src/services/billing/webhook-handler.ts`:

```ts
import type Stripe from 'stripe';
import { supabaseAdmin } from '../../config/supabase.js';
import { atualizarStatus, buscarPorCustomerId } from './assinatura-repo.js';
import { pacotePorId } from './pacotes.js';

export const CREDITOS_DA_COTA = 10000;

/**
 * Grava o evento e diz se ele é novo. O Stripe reenvia quando não
 * recebe 200; sem esta trava, um reenvio credita a cota duas vezes.
 */
export async function registrarEventoSeNovo(eventId: string, tipo: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('stripe_eventos_processados')
    .insert([{ event_id: eventId, tipo }]);

  // Violação de chave primária significa evento repetido.
  return !error;
}

async function restauranteDoEvento(objeto: any): Promise<string | null> {
  const direto = objeto?.metadata?.restaurante_id || objeto?.client_reference_id;
  if (direto) return direto;

  const customerId = typeof objeto?.customer === 'string' ? objeto.customer : objeto?.customer?.id;
  if (!customerId) return null;

  const assinatura = await buscarPorCustomerId(customerId);
  return assinatura?.restauranteId ?? null;
}

function paraIso(epochSegundos: unknown): string | undefined {
  return typeof epochSegundos === 'number'
    ? new Date(epochSegundos * 1000).toISOString()
    : undefined;
}

export async function processarEvento(evento: Stripe.Event): Promise<void> {
  const objeto = evento.data.object as any;
  const restauranteId = await restauranteDoEvento(objeto);

  if (!restauranteId) {
    console.error(`[Stripe] Evento ${evento.id} (${evento.type}) sem restaurante identificável.`);
    return;
  }

  switch (evento.type) {
    case 'checkout.session.completed': {
      if (objeto.mode === 'payment') {
        const pacote = pacotePorId(objeto.metadata?.pacote_id);

        if (!pacote) {
          console.error(`[Stripe] Compra ${evento.id} sem pacote reconhecível.`);
          return;
        }

        await supabaseAdmin.rpc('creditar_pacote_avulso', {
          p_restaurante_id: restauranteId,
          p_qtd: pacote.creditos,
        });
        return;
      }

      await atualizarStatus(restauranteId, {
        status: 'ativa',
        stripeSubscriptionId: typeof objeto.subscription === 'string' ? objeto.subscription : null,
      });

      await supabaseAdmin.rpc('resetar_cota_mensal', {
        p_restaurante_id: restauranteId,
        p_qtd: CREDITOS_DA_COTA,
      });
      return;
    }

    case 'invoice.paid': {
      // A primeira fatura já foi creditada pelo checkout.session.completed.
      // O billing_reason vem do próprio Stripe — não inferir por data.
      if (objeto.billing_reason === 'subscription_create') return;

      await atualizarStatus(restauranteId, {
        status: 'ativa',
        periodoFim: paraIso(objeto.period_end) ?? null,
      });

      await supabaseAdmin.rpc('resetar_cota_mensal', {
        p_restaurante_id: restauranteId,
        p_qtd: CREDITOS_DA_COTA,
      });
      return;
    }

    case 'invoice.payment_failed': {
      // Não zera crédito: o Stripe ainda vai tentar cobrar de novo, e
      // derrubar o atendimento por um cartão recusado perde cliente.
      await atualizarStatus(restauranteId, { status: 'inadimplente' });
      return;
    }

    case 'customer.subscription.deleted': {
      await atualizarStatus(restauranteId, {
        status: 'cancelada',
        canceladaEm: new Date().toISOString(),
      });

      // Zera só a cota. Avulso foi pago à parte e continua valendo.
      await supabaseAdmin.rpc('resetar_cota_mensal', { p_restaurante_id: restauranteId, p_qtd: 0 });
      return;
    }

    case 'charge.refunded': {
      await atualizarStatus(restauranteId, {
        status: 'reembolsada',
        canceladaEm: new Date().toISOString(),
      });

      await supabaseAdmin.rpc('resetar_cota_mensal', { p_restaurante_id: restauranteId, p_qtd: 0 });
      return;
    }

    default:
      return;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npm test -- src/services/billing/webhook-handler.test.ts`
Esperado: PASS, 11 testes.

- [ ] **Step 5: Montar a rota em `src/server.ts`**

O `express.json()` global já preserva o corpo cru em `req.rawBody` pela opção `verify` (`src/server.ts:26-30`) — é o mesmo mecanismo do webhook da Meta. Não montar parser adicional.

Imports:

```ts
import { getStripe, getWebhookSecret } from './services/billing/stripe-client.js';
import { processarEvento, registrarEventoSeNovo } from './services/billing/webhook-handler.js';
```

Rota:

```ts
// ------------------------------------------------------------------
// 3.4 WEBHOOK DO STRIPE
// ------------------------------------------------------------------
app.post('/api/webhooks/stripe', async (req, res) => {
  const assinaturaHeader = req.headers['stripe-signature'];

  if (!assinaturaHeader || !req.rawBody) {
    return res.status(400).send('Assinatura ausente.');
  }

  let evento;

  try {
    evento = getStripe().webhooks.constructEvent(
      req.rawBody,
      assinaturaHeader as string,
      getWebhookSecret(),
    );
  } catch (erro: any) {
    console.error('[Stripe] Assinatura inválida:', erro.message);
    return res.status(400).send('Assinatura inválida.');
  }

  const ehNovo = await registrarEventoSeNovo(evento.id, evento.type);

  if (!ehNovo) {
    console.log(`[Stripe] Evento ${evento.id} já processado. Ignorando duplicata.`);
    return res.status(200).json({ received: true });
  }

  // Responde antes de processar: o Stripe considera timeout acima de
  // ~20s e reenvia. O processamento segue em segundo plano.
  res.status(200).json({ received: true });

  setImmediate(async () => {
    try {
      await processarEvento(evento);
    } catch (erro) {
      console.error(`[Stripe] Falha ao processar ${evento.id}:`, erro);
    }
  });
});
```

- [ ] **Step 6: Testar de ponta a ponta com a CLI do Stripe**

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Em outro terminal:

```bash
stripe trigger checkout.session.completed
```

Esperado: log `[Stripe]` no backend e resposta 200 na CLI. Disparar o mesmo evento duas vezes e confirmar o log "já processado" na segunda.

- [ ] **Step 7: Commit**

```bash
git add src/services/billing/webhook-handler.ts src/services/billing/webhook-handler.test.ts src/server.ts
git commit -m "feat: Processa os webhooks de cobranca do Stripe" -m "Idempotencia por event_id e billing_reason para nao creditar a cota duas vezes na primeira fatura." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Status da assinatura e trava de acesso

**Files:**
- Create: `src/middleware/exigir-assinatura.ts`
- Create: `src/services/billing/status.ts`
- Create: `src/services/billing/status.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `buscarAssinatura`, `atualizarStatus` (Task 7); `getStripe` (Task 6)
- Produces: `GET /api/billing/status` devolvendo `{ success: true, status, periodoFim, creditosCota, creditosAvulsos, cotaTotal }`; `exigirAssinaturaAtiva` de `src/middleware/exigir-assinatura.js`; `reconciliarSePreciso(restauranteId: string, criadaEm: string, status: string): Promise<string>` de `status.js`

- [ ] **Step 1: Escrever o teste da reconciliação**

Criar `src/services/billing/status.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listarSubscriptionsMock = vi.fn();
const atualizarStatusMock = vi.fn();
const buscarAssinaturaMock = vi.fn();

vi.mock('./stripe-client.js', () => ({
  getStripe: () => ({ subscriptions: { list: listarSubscriptionsMock } }),
}));

vi.mock('./assinatura-repo.js', () => ({
  atualizarStatus: (...a: unknown[]) => atualizarStatusMock(...a),
  buscarAssinatura: (...a: unknown[]) => buscarAssinaturaMock(...a),
}));

const { reconciliarSePreciso } = await import('./status.js');

const agora = () => new Date().toISOString();
const minutosAtras = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  listarSubscriptionsMock.mockResolvedValue({ data: [] });
});

describe('reconciliarSePreciso', () => {
  it('não consulta o Stripe quando a assinatura já está ativa', async () => {
    const status = await reconciliarSePreciso('rest-1', minutosAtras(60), 'ativa');

    expect(listarSubscriptionsMock).not.toHaveBeenCalled();
    expect(status).toBe('ativa');
  });

  // Nos primeiros minutos o webhook ainda está a caminho. Consultar aí
  // só gastaria chamada de API.
  it('não consulta o Stripe quando está pendente há pouco tempo', async () => {
    const status = await reconciliarSePreciso('rest-1', minutosAtras(2), 'pendente');

    expect(listarSubscriptionsMock).not.toHaveBeenCalled();
    expect(status).toBe('pendente');
  });

  it('consulta o Stripe quando está pendente há mais de 5 minutos', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });

    await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(listarSubscriptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', status: 'active' }),
    );
  });

  it('ativa a conta quando o Stripe diz que a assinatura existe', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockResolvedValue({
      data: [{ id: 'sub_1', current_period_end: 1793491200 }],
    });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(atualizarStatusMock).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      status: 'ativa',
      stripeSubscriptionId: 'sub_1',
    }));
    expect(status).toBe('ativa');
  });

  it('mantém pendente quando o Stripe também não conhece assinatura', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(atualizarStatusMock).not.toHaveBeenCalled();
    expect(status).toBe('pendente');
  });

  it('não quebra quando a conta ainda não tem Customer', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: null });

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(listarSubscriptionsMock).not.toHaveBeenCalled();
    expect(status).toBe('pendente');
  });

  // Uma indisponibilidade do Stripe não pode transformar a tela de
  // status em erro: o lojista continua vendo 'pendente' e tenta de novo.
  it('devolve o status atual quando o Stripe falha', async () => {
    buscarAssinaturaMock.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    listarSubscriptionsMock.mockRejectedValue(new Error('Stripe fora do ar'));

    const status = await reconciliarSePreciso('rest-1', minutosAtras(10), 'pendente');

    expect(status).toBe('pendente');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npm test -- src/services/billing/status.test.ts`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a reconciliação**

Criar `src/services/billing/status.ts`:

```ts
import { getStripe } from './stripe-client.js';
import { atualizarStatus, buscarAssinatura } from './assinatura-repo.js';

const MINUTOS_ATE_RECONCILIAR = 5;

/**
 * Rede de segurança para webhook perdido: se a conta está pendente há
 * mais que alguns minutos, pergunta ao Stripe e se corrige. É a
 * reconciliação sob demanda, sem cron.
 */
export async function reconciliarSePreciso(
  restauranteId: string,
  criadaEm: string,
  status: string,
): Promise<string> {
  if (status !== 'pendente') return status;

  const minutosDesde = (Date.now() - new Date(criadaEm).getTime()) / 60_000;
  if (minutosDesde < MINUTOS_ATE_RECONCILIAR) return status;

  const assinatura = await buscarAssinatura(restauranteId);
  if (!assinatura?.stripeCustomerId) return status;

  try {
    const { data } = await getStripe().subscriptions.list({
      customer: assinatura.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    const subscription = data[0];
    if (!subscription) return status;

    const periodoFim = typeof (subscription as any).current_period_end === 'number'
      ? new Date((subscription as any).current_period_end * 1000).toISOString()
      : null;

    await atualizarStatus(restauranteId, {
      status: 'ativa',
      stripeSubscriptionId: subscription.id,
      periodoFim,
    });

    return 'ativa';
  } catch (erro) {
    // Stripe indisponível não pode virar erro na tela do lojista.
    console.error('[Billing] Falha ao reconciliar com o Stripe:', erro);
    return status;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npm test -- src/services/billing/status.test.ts`
Esperado: PASS, 7 testes.

- [ ] **Step 5: Criar o middleware de assinatura**

Criar `src/middleware/exigir-assinatura.ts`:

```ts
import type { Request, Response, NextFunction } from 'express';
import { buscarAssinatura } from '../services/billing/assinatura-repo.js';

// 'inadimplente' passa de propósito: o Stripe ainda vai tentar cobrar
// de novo, e cortar o acesso por um cartão recusado perde cliente à toa.
const STATUS_COM_ACESSO = ['ativa', 'inadimplente'];

export async function exigirAssinaturaAtiva(req: Request, res: Response, next: NextFunction) {
  const assinatura = await buscarAssinatura(req.restauranteId!);

  if (!assinatura || !STATUS_COM_ACESSO.includes(assinatura.status)) {
    return res.status(402).json({
      success: false,
      error: 'Assinatura inativa.',
      status: assinatura?.status ?? 'pendente',
    });
  }

  return next();
}
```

- [ ] **Step 6: Adicionar a rota de status em `src/server.ts`**

Imports:

```ts
import { reconciliarSePreciso } from './services/billing/status.js';
import { exigirAssinaturaAtiva } from './middleware/exigir-assinatura.js';
import { CREDITOS_DA_COTA } from './services/billing/webhook-handler.js';
```

Rota:

```ts
app.get('/api/billing/status', autenticar, async (req, res) => {
  const { data: assinatura } = await supabaseAdmin
    .from('assinaturas')
    .select('status, periodo_fim, created_at')
    .eq('restaurante_id', req.restauranteId)
    .maybeSingle();

  if (!assinatura) {
    return res.status(404).json({ success: false, error: 'Conta sem assinatura.' });
  }

  const status = await reconciliarSePreciso(
    req.restauranteId!,
    assinatura.created_at,
    assinatura.status,
  );

  const { data: saldo } = await supabaseAdmin
    .from('restaurantes')
    .select('creditos_cota, creditos_avulsos')
    .eq('id', req.restauranteId)
    .single();

  return res.json({
    success: true,
    status,
    periodoFim: assinatura.periodo_fim,
    creditosCota: saldo?.creditos_cota ?? 0,
    creditosAvulsos: saldo?.creditos_avulsos ?? 0,
    cotaTotal: CREDITOS_DA_COTA,
  });
});
```

- [ ] **Step 7: Aplicar a trava nas rotas do painel**

Nas rotas `/api/dashboard/metricas`, `/api/crm/clientes`, `/api/crm/reativacao`, `/api/crm/estagio`, `/api/ifood/sync`, `/api/pdv/pedidos` e `/api/pdv/pedidos/:id/status`, acrescentar os dois middlewares antes do handler. Exemplo:

```ts
app.get('/api/dashboard/metricas', autenticar, exigirAssinaturaAtiva, async (req, res) => {
```

Não aplicar em `/api/billing/*`, `/api/auth/*`, `/webhook/whatsapp`, `/api/webhooks/stripe`, `/api/cron/*` nem `/health` — quem está pendente precisa conseguir pagar.

- [ ] **Step 8: Rodar a suíte e conferir a trava**

Rodar: `npm test`
Esperado: PASS.

Com o backend rodando, usando o token de um cadastro que não pagou:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboard/metricas -H "Authorization: Bearer SEU_TOKEN"
```

Esperado: `402`.

- [ ] **Step 9: Commit**

```bash
git add src/services/billing/status.ts src/services/billing/status.test.ts src/middleware/exigir-assinatura.ts src/server.ts
git commit -m "feat: Expoe o status da assinatura e trava o painel de quem nao pagou" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Formulário de cadastro no frontend

**Files:**
- Create: `frontend/src/utils/cnpj.ts`
- Create: `frontend/src/utils/cnpj.test.ts`
- Create: `frontend/src/services/viacep.ts`
- Modify: `frontend/src/pages/site/Cadastro.tsx`
- Create: `frontend/src/pages/site/Cadastro.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/cadastro` (Task 5)
- Produces: `/cadastro` funcional. `validarCnpj(cnpj: string): boolean` e `formatarCnpj(cnpj: string): string` de `frontend/src/utils/cnpj.ts`; `buscarCep(cep: string): Promise<{ logradouro: string; bairro: string; cidade: string; uf: string } | null>` de `frontend/src/services/viacep.ts`

- [ ] **Step 1: Copiar o validador de CNPJ para o frontend**

Criar `frontend/src/utils/cnpj.ts` com o mesmo algoritmo do backend, mais o formatador de exibição:

```ts
/**
 * Mesmo algoritmo do backend (src/utils/cnpj.ts). Duplicado de
 * propósito: o backend é ESM em Node e o frontend é bundle de
 * navegador, e compartilhar um pacote entre os dois custaria mais
 * do que estas trinta linhas. O backend continua sendo a autoridade —
 * isto aqui existe só para dar erro antes de gastar uma requisição.
 */

export function normalizarCnpj(cnpj: string): string {
  return (cnpj || '').replace(/\D/g, '');
}

function calcularDigito(base: string, pesoInicial: number): number {
  let peso = pesoInicial;
  let soma = 0;

  for (const caractere of base) {
    soma += Number(caractere) * peso;
    peso -= 1;
    if (peso < 2) peso = 9;
  }

  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCnpj(cnpj: string): boolean {
  const digitos = normalizarCnpj(cnpj);

  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  if (calcularDigito(digitos.slice(0, 12), 5) !== Number(digitos[12])) return false;
  return calcularDigito(digitos.slice(0, 13), 6) === Number(digitos[13]);
}

export function formatarCnpj(cnpj: string): string {
  const d = normalizarCnpj(cnpj).slice(0, 14);

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
```

- [ ] **Step 2: Escrever o teste do validador do frontend**

Criar `frontend/src/utils/cnpj.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validarCnpj, formatarCnpj } from './cnpj';

describe('validarCnpj', () => {
  it('aceita CNPJ válido', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(validarCnpj('11222333000182')).toBe(false);
  });

  it('recusa todos os dígitos iguais', () => {
    expect(validarCnpj('11111111111111')).toBe(false);
  });
});

describe('formatarCnpj', () => {
  it('formata conforme o usuário digita', () => {
    expect(formatarCnpj('11')).toBe('11');
    expect(formatarCnpj('11222')).toBe('11.222');
    expect(formatarCnpj('11222333')).toBe('11.222.333');
    expect(formatarCnpj('112223330001')).toBe('11.222.333/0001');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('ignora o que passar de 14 dígitos', () => {
    expect(formatarCnpj('112223330001819999')).toBe('11.222.333/0001-81');
  });
});
```

- [ ] **Step 3: Rodar os testes do validador**

Rodar: `npm --prefix frontend test -- src/utils/cnpj.test.ts`
Esperado: PASS, 5 testes.

- [ ] **Step 4: Criar o serviço de CEP**

Criar `frontend/src/services/viacep.ts`:

```ts
export interface EnderecoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/**
 * Conveniência, não requisito: se o ViaCEP estiver fora do ar ou o CEP
 * não existir, devolve null e o lojista digita o endereço à mão. O
 * cadastro nunca trava por causa disto.
 */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const digitos = (cep || '').replace(/\D/g, '');
  if (digitos.length !== 8) return null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
    if (!resposta.ok) return null;

    const dados = await resposta.json();
    if (dados.erro) return null;

    return {
      logradouro: dados.logradouro || '',
      bairro: dados.bairro || '',
      cidade: dados.localidade || '',
      uf: dados.uf || '',
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Escrever o teste do formulário**

Criar `frontend/src/pages/site/Cadastro.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Cadastro from './Cadastro';

const navegar = vi.fn();

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => navegar };
});

function montar() {
  return render(<MemoryRouter><Cadastro /></MemoryRouter>);
}

async function preencherTudo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/seu nome/i), 'Marina Souza');
  await user.type(screen.getByLabelText(/e-mail/i), 'marina@pizzaria.com.br');
  await user.type(screen.getByLabelText(/senha/i), 'senhaforte123');
  await user.type(screen.getByLabelText(/nome do restaurante/i), 'Pizzaria do Bairro');
  await user.type(screen.getByLabelText(/cnpj/i), '11222333000181');
  await user.type(screen.getByLabelText(/cep/i), '01310100');
  await user.type(screen.getByLabelText(/rua/i), 'Avenida Paulista');
  await user.type(screen.getByLabelText(/número/i), '1000');
  await user.type(screen.getByLabelText(/bairro/i), 'Bela Vista');
  await user.type(screen.getByLabelText(/cidade/i), 'São Paulo');
  await user.type(screen.getByLabelText(/^uf$/i), 'SP');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('viacep')) {
      return { ok: true, json: async () => ({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, token: 'jwt-de-teste' }) } as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cadastro', () => {
  it('mostra o formulário, não a mensagem de "em breve"', () => {
    montar();
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeInTheDocument();
    expect(screen.queryByText(/estamos finalizando/i)).not.toBeInTheDocument();
  });

  it('acusa CNPJ inválido antes de chamar o servidor', async () => {
    const user = userEvent.setup();
    montar();

    await preencherTudo(user);
    await user.clear(screen.getByLabelText(/cnpj/i));
    await user.type(screen.getByLabelText(/cnpj/i), '11222333000182');
    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    expect(await screen.findByText('CNPJ inválido.')).toBeInTheDocument();
    const chamadasAoCadastro = (globalThis.fetch as any).mock.calls
      .filter(([url]: [string]) => String(url).includes('/auth/cadastro'));
    expect(chamadasAoCadastro).toHaveLength(0);
  });

  it('guarda o token e leva ao pagamento quando o cadastro dá certo', async () => {
    const user = userEvent.setup();
    montar();

    await preencherTudo(user);
    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('jwt-de-teste');
    });
    expect(navegar).toHaveBeenCalledWith('/assinatura/pagamento');
  });

  it('mostra o erro que o servidor devolveu', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('viacep')) {
        return { ok: true, json: async () => ({ erro: true }) } as Response;
      }
      return { ok: false, json: async () => ({ success: false, error: 'Já existe uma conta com este e-mail.' }) } as Response;
    }));

    const user = userEvent.setup();
    montar();

    await preencherTudo(user);
    await user.click(screen.getByRole('button', { name: /criar conta/i }));

    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeInTheDocument();
  });

  it('preenche o endereço sozinho quando o CEP é encontrado', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText(/cep/i), '01310100');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByLabelText(/rua/i)).toHaveValue('Avenida Paulista');
      expect(screen.getByLabelText(/cidade/i)).toHaveValue('São Paulo');
    });
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Rodar: `npm --prefix frontend test -- src/pages/site/Cadastro.test.tsx`
Esperado: FAIL — a página ainda é a placeholder, não existe botão "Criar conta".

- [ ] **Step 7: Implementar o formulário**

Substituir o conteúdo de `frontend/src/pages/site/Cadastro.tsx`:

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container';
import { API_URL } from '../../services/api';
import { validarCnpj, formatarCnpj, normalizarCnpj } from '../../utils/cnpj';
import { buscarCep } from '../../services/viacep';

const CAMPOS_INICIAIS = {
  nome: '', email: '', senha: '', restauranteNome: '', cnpj: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
};

const rotuloClasse = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-600';
const campoClasse =
  'w-full rounded-lg border border-stone-300 bg-white p-3 text-sm text-ink-800 ' +
  'focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

export default function Cadastro() {
  const [campos, setCampos] = useState(CAMPOS_INICIAIS);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  const atualizar = (chave: keyof typeof CAMPOS_INICIAIS, valor: string) =>
    setCampos((atual) => ({ ...atual, [chave]: valor }));

  const completarPeloCep = async () => {
    const endereco = await buscarCep(campos.cep);
    if (!endereco) return;

    setCampos((atual) => ({
      ...atual,
      logradouro: endereco.logradouro || atual.logradouro,
      bairro: endereco.bairro || atual.bairro,
      cidade: endereco.cidade || atual.cidade,
      uf: endereco.uf || atual.uf,
    }));
  };

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);

    // Validação local só para não gastar requisição no erro mais comum.
    // O backend valida tudo de novo.
    if (!validarCnpj(campos.cnpj)) {
      setErro('CNPJ inválido.');
      return;
    }

    if (campos.senha.length < 8) {
      setErro('A senha precisa ter ao menos 8 caracteres.');
      return;
    }

    setEnviando(true);

    try {
      const resposta = await fetch(`${API_URL}/auth/cadastro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...campos, cnpj: normalizarCnpj(campos.cnpj) }),
      });

      const dados = await resposta.json();

      if (resposta.ok && dados.success) {
        localStorage.setItem('auth_token', dados.token);
        navigate('/assinatura/pagamento');
        return;
      }

      setErro(dados.error || 'Não foi possível criar a conta.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Criar sua conta
        </h1>
        <p className="mt-3 text-ink-600">
          Leva dois minutos. Você revisa o pagamento no passo seguinte.
        </p>

        {erro && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <form onSubmit={enviar} className="mt-8 space-y-8">
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Seus dados
            </legend>

            <div>
              <label className={rotuloClasse} htmlFor="nome">Seu nome</label>
              <input id="nome" className={campoClasse} required
                value={campos.nome} onChange={(e) => atualizar('nome', e.target.value)} />
            </div>

            <div>
              <label className={rotuloClasse} htmlFor="email">E-mail</label>
              <input id="email" type="email" className={campoClasse} required
                value={campos.email} onChange={(e) => atualizar('email', e.target.value)} />
            </div>

            <div>
              <label className={rotuloClasse} htmlFor="senha">Senha</label>
              <input id="senha" type="password" className={campoClasse} required minLength={8}
                value={campos.senha} onChange={(e) => atualizar('senha', e.target.value)} />
              <p className="mt-1 text-xs text-stone-500">Ao menos 8 caracteres.</p>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Seu restaurante
            </legend>

            <div>
              <label className={rotuloClasse} htmlFor="restauranteNome">Nome do restaurante</label>
              <input id="restauranteNome" className={campoClasse} required
                value={campos.restauranteNome} onChange={(e) => atualizar('restauranteNome', e.target.value)} />
            </div>

            <div>
              <label className={rotuloClasse} htmlFor="cnpj">CNPJ</label>
              <input id="cnpj" className={campoClasse} required inputMode="numeric"
                value={formatarCnpj(campos.cnpj)}
                onChange={(e) => atualizar('cnpj', e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Endereço
            </legend>
            <p className="text-sm text-ink-600">
              É daqui que a IA calcula a taxa de entrega dos seus pedidos.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={rotuloClasse} htmlFor="cep">CEP</label>
                <input id="cep" className={campoClasse} required inputMode="numeric"
                  value={campos.cep} onBlur={completarPeloCep}
                  onChange={(e) => atualizar('cep', e.target.value)} />
              </div>

              <div className="sm:col-span-2">
                <label className={rotuloClasse} htmlFor="logradouro">Rua</label>
                <input id="logradouro" className={campoClasse} required
                  value={campos.logradouro} onChange={(e) => atualizar('logradouro', e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={rotuloClasse} htmlFor="numero">Número</label>
                <input id="numero" className={campoClasse} required
                  value={campos.numero} onChange={(e) => atualizar('numero', e.target.value)} />
              </div>

              <div>
                <label className={rotuloClasse} htmlFor="complemento">Complemento</label>
                <input id="complemento" className={campoClasse}
                  value={campos.complemento} onChange={(e) => atualizar('complemento', e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={rotuloClasse} htmlFor="bairro">Bairro</label>
                <input id="bairro" className={campoClasse} required
                  value={campos.bairro} onChange={(e) => atualizar('bairro', e.target.value)} />
              </div>

              <div>
                <label className={rotuloClasse} htmlFor="cidade">Cidade</label>
                <input id="cidade" className={campoClasse} required
                  value={campos.cidade} onChange={(e) => atualizar('cidade', e.target.value)} />
              </div>

              <div>
                <label className={rotuloClasse} htmlFor="uf">UF</label>
                <input id="uf" className={campoClasse} required maxLength={2}
                  value={campos.uf} onChange={(e) => atualizar('uf', e.target.value.toUpperCase())} />
              </div>
            </div>
          </fieldset>

          <button type="submit" disabled={enviando}
            className="w-full rounded-lg bg-brand-700 p-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
            {enviando ? 'Criando sua conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-ink-600">
          Já tem conta? <Link to="/login" className="font-semibold text-brand-700">Entrar</Link>
        </p>
      </div>
    </Container>
  );
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Rodar: `npm --prefix frontend test -- src/pages/site/Cadastro.test.tsx`
Esperado: PASS, 5 testes. Se algum `getByLabelText` falhar, o `htmlFor` não bate com o `id` — corrigir o par, não o teste.

- [ ] **Step 9: Rodar a suíte inteira do frontend**

Rodar: `npm --prefix frontend test`
Esperado: PASS. Atenção a `coerencia-comercial.test.tsx` e `Landing.guardas.test.tsx`, que fazem afirmações sobre a landing e podem referenciar a placeholder antiga.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/utils/cnpj.ts frontend/src/utils/cnpj.test.ts frontend/src/services/viacep.ts frontend/src/pages/site/Cadastro.tsx frontend/src/pages/site/Cadastro.test.tsx
git commit -m "feat: Substitui a placeholder de cadastro pelo formulario real" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Contexto de assinatura, trava no roteador e tela de confirmação

**Files:**
- Create: `frontend/src/contexts/AssinaturaContext.tsx`
- Create: `frontend/src/pages/app/Pagamento.tsx`
- Create: `frontend/src/pages/app/Confirmando.tsx`
- Create: `frontend/src/pages/app/Confirmando.test.tsx`
- Modify: `frontend/src/components/ProtectedRoute.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/app/Login.tsx`

**Interfaces:**
- Consumes: `GET /api/billing/status`, `POST /api/billing/checkout` (Tasks 7 e 9)
- Produces: `AssinaturaProvider` e `useAssinatura(): { status, periodoFim, creditosCota, creditosAvulsos, cotaTotal, carregando, recarregar }`; `ProtectedRoute` com a prop opcional `exigirAssinatura?: boolean`; rotas `/assinatura/pagamento` e `/assinatura/confirmando`

- [ ] **Step 1: Criar o contexto**

Criar `frontend/src/contexts/AssinaturaContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';

export type StatusAssinatura =
  | 'pendente' | 'ativa' | 'inadimplente' | 'cancelada' | 'reembolsada';

interface EstadoAssinatura {
  status: StatusAssinatura | null;
  periodoFim: string | null;
  creditosCota: number;
  creditosAvulsos: number;
  cotaTotal: number;
  carregando: boolean;
  recarregar: () => Promise<void>;
}

const ESTADO_INICIAL: EstadoAssinatura = {
  status: null,
  periodoFim: null,
  creditosCota: 0,
  creditosAvulsos: 0,
  cotaTotal: 10000,
  carregando: true,
  recarregar: async () => {},
};

const Contexto = createContext<EstadoAssinatura>(ESTADO_INICIAL);

export function AssinaturaProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState(ESTADO_INICIAL);

  const recarregar = useCallback(async () => {
    try {
      const resposta = await apiFetch('/billing/status');
      const dados = await resposta.json();

      if (!dados.success) {
        setEstado((a) => ({ ...a, carregando: false }));
        return;
      }

      setEstado((a) => ({
        ...a,
        status: dados.status,
        periodoFim: dados.periodoFim,
        creditosCota: dados.creditosCota,
        creditosAvulsos: dados.creditosAvulsos,
        cotaTotal: dados.cotaTotal,
        carregando: false,
      }));
    } catch {
      // apiFetch já redireciona no 401. Aqui só evitamos travar a tela
      // em "carregando" para sempre.
      setEstado((a) => ({ ...a, carregando: false }));
    }
  }, []);

  useEffect(() => {
    setEstado((a) => ({ ...a, recarregar }));
    void recarregar();
  }, [recarregar]);

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>;
}

export function useAssinatura() {
  return useContext(Contexto);
}
```

- [ ] **Step 2: Atualizar o `ProtectedRoute`**

Substituir `frontend/src/components/ProtectedRoute.tsx`:

```tsx
import { Navigate } from 'react-router-dom';
import { useAssinatura } from '../contexts/AssinaturaContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  exigirAssinatura?: boolean;
}

// 'inadimplente' passa: o Stripe ainda vai retentar a cobrança, e a
// faixa de aviso já comunica a pendência. Mesma regra do middleware do
// backend, que é quem de fato protege os dados.
const STATUS_COM_ACESSO = ['ativa', 'inadimplente'];

export default function ProtectedRoute({ children, exigirAssinatura }: ProtectedRouteProps) {
  const token = localStorage.getItem('auth_token');
  const { status, carregando } = useAssinatura();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!exigirAssinatura) {
    return <>{children}</>;
  }

  if (carregando) {
    return <div className="py-24 text-center text-sm text-ink-600">Carregando…</div>;
  }

  if (!status || !STATUS_COM_ACESSO.includes(status)) {
    return <Navigate to="/assinatura/pagamento" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Criar a tela de pagamento**

Criar `frontend/src/pages/app/Pagamento.tsx`:

```tsx
import { useState } from 'react';
import Container from '../../components/ui/Container';
import { apiFetch } from '../../services/api';

export default function Pagamento() {
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  const irParaCheckout = async () => {
    setErro(null);
    setIndo(true);

    try {
      const resposta = await apiFetch('/billing/checkout', { method: 'POST' });
      const dados = await resposta.json();

      if (dados.success && dados.url) {
        window.location.href = dados.url;
        return;
      }

      setErro(dados.error || 'Não foi possível abrir o pagamento.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setIndo(false);
    }
  };

  return (
    <Container className="py-20">
      <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-ink-800">
          Falta só o pagamento
        </h1>
        <p className="mt-3 text-ink-600">
          Sua conta já está criada. Assine para liberar o painel.
        </p>

        <p className="mt-6 text-4xl font-bold tracking-tight text-ink-800">
          R$ 179,99<span className="text-base font-medium text-ink-600"> /mês</span>
        </p>

        <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4 text-left text-sm">
          <p className="font-semibold text-brand-700">✓ Teste sem risco por 7 dias</p>
          <p className="mt-1 text-ink-600">
            A cobrança acontece na contratação; se pedir reembolso em até 7 dias,
            devolvemos 100% do valor.
          </p>
        </div>

        {erro && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <button onClick={irParaCheckout} disabled={indo}
          className="mt-6 w-full rounded-lg bg-brand-700 p-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
          {indo ? 'Abrindo pagamento...' : 'Ir para o pagamento'}
        </button>

        <p className="mt-4 text-xs text-stone-500">
          O pagamento acontece no ambiente seguro do Stripe.
        </p>
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Escrever o teste da tela de confirmação**

Criar `frontend/src/pages/app/Confirmando.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Confirmando from './Confirmando';

const navegar = vi.fn();

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => navegar };
});

const recarregar = vi.fn();
let statusAtual: string | null = 'pendente';

vi.mock('../../contexts/AssinaturaContext', () => ({
  useAssinatura: () => ({ status: statusAtual, recarregar, carregando: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  statusAtual = 'pendente';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Confirmando', () => {
  it('mostra que está confirmando o pagamento', () => {
    render(<MemoryRouter><Confirmando /></MemoryRouter>);
    expect(screen.getByText(/confirmando seu pagamento/i)).toBeInTheDocument();
  });

  it('entra no painel assim que a assinatura fica ativa', async () => {
    statusAtual = 'ativa';
    render(<MemoryRouter><Confirmando /></MemoryRouter>);

    await waitFor(() => {
      expect(navegar).toHaveBeenCalledWith('/app/dashboard', { replace: true });
    });
  });

  // O webhook é assíncrono. Sem esta mensagem, quem esperou 30s acha
  // que o pagamento falhou — e paga de novo.
  it('mostra mensagem tranquilizadora quando o tempo estoura', async () => {
    render(<MemoryRouter><Confirmando /></MemoryRouter>);

    await vi.advanceTimersByTimeAsync(31_000);

    expect(await screen.findByText(/pagamento recebido/i)).toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('consulta o status repetidamente enquanto espera', async () => {
    render(<MemoryRouter><Confirmando /></MemoryRouter>);

    await vi.advanceTimersByTimeAsync(6_000);

    expect(recarregar.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

Rodar: `npm --prefix frontend test -- src/pages/app/Confirmando.test.tsx`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 6: Implementar a tela de confirmação**

Criar `frontend/src/pages/app/Confirmando.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const INTERVALO_MS = 2_000;
const LIMITE_MS = 30_000;

export default function Confirmando() {
  const { status, recarregar } = useAssinatura();
  const [desistiu, setDesistiu] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'ativa') {
      navigate('/app/dashboard', { replace: true });
    }
  }, [status, navigate]);

  useEffect(() => {
    if (status === 'ativa') return;

    const pulso = setInterval(() => { void recarregar(); }, INTERVALO_MS);
    const prazo = setTimeout(() => {
      clearInterval(pulso);
      setDesistiu(true);
    }, LIMITE_MS);

    return () => {
      clearInterval(pulso);
      clearTimeout(prazo);
    };
  }, [status, recarregar]);

  return (
    <Container className="py-24">
      <div className="mx-auto max-w-md text-center">
        {desistiu ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-800">
              Pagamento recebido
            </h1>
            <p className="mt-3 text-ink-600">
              Estamos liberando seu acesso. Isso costuma levar menos de um minuto —
              atualize a página ou entre novamente daqui a pouco.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-ink-800">
              Confirmando seu pagamento
            </h1>
            <p className="mt-3 text-ink-600">
              Só um instante. Não feche esta página.
            </p>
          </>
        )}
      </div>
    </Container>
  );
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Rodar: `npm --prefix frontend test -- src/pages/app/Confirmando.test.tsx`
Esperado: PASS, 4 testes.

- [ ] **Step 8: Corrigir o redirecionamento do login**

`frontend/src/pages/app/Login.tsx:28` navega para `/dashboard`, mas a rota registrada é `/app/dashboard` — hoje quem faz login cai no 404. Trocar:

```tsx
        navigate('/dashboard');
```

por:

```tsx
        navigate('/app/dashboard');
```

- [ ] **Step 9: Registrar as rotas e envolver o painel no provider**

Substituir o corpo de `frontend/src/App.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import SiteLayout from './components/layout/SiteLayout';
import Landing from './pages/site/Landing';
import Sobre from './pages/site/Sobre';
import Cadastro from './pages/site/Cadastro';
import NaoEncontrado from './pages/site/NaoEncontrado';
import ProtectedRoute from './components/ProtectedRoute';
import { AssinaturaProvider } from './contexts/AssinaturaContext';

// O painel so e baixado quando o usuario entra nele. Sem isso, um
// visitante da landing carregaria o bundle inteiro para ver a home.
// LegalPage tambem e lazy: ela arrasta react-markdown + remark-gfm + os
// tres documentos legais inteiros, que nenhum visitante da home precisa.
const LegalPage = lazy(() => import('./pages/site/LegalPage'));
const Login = lazy(() => import('./pages/app/Login'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Crm = lazy(() => import('./pages/app/Crm'));
const Ifood = lazy(() => import('./pages/app/Ifood'));
const Pagamento = lazy(() => import('./pages/app/Pagamento'));
const Confirmando = lazy(() => import('./pages/app/Confirmando'));
const Assinatura = lazy(() => import('./pages/app/Assinatura'));
const Creditos = lazy(() => import('./pages/app/Creditos'));

const Carregando = () => (
  <div className="py-24 text-center text-sm text-ink-600">Carregando…</div>
);

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <AssinaturaProvider>
        <Routes>
          {/* Site publico: herda Header e Footer via SiteLayout */}
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/sobre" element={<Sobre />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/termos" element={<LegalPage documento="termos" />} />
            <Route path="/privacidade" element={<LegalPage documento="privacidade" />} />
            <Route path="/exclusao-de-dados" element={<LegalPage documento="exclusao-de-dados" />} />
            <Route path="*" element={<NaoEncontrado />} />
          </Route>

          {/* Painel: fora do layout do site, tera navegacao propria no ciclo 3 */}
          <Route path="/login" element={<Login />} />

          {/* Pagamento e confirmacao exigem login, mas nao assinatura:
              sao justamente as telas de quem ainda nao pagou. */}
          <Route path="/assinatura/pagamento" element={<ProtectedRoute><Pagamento /></ProtectedRoute>} />
          <Route path="/assinatura/confirmando" element={<ProtectedRoute><Confirmando /></ProtectedRoute>} />

          <Route path="/app/dashboard" element={<ProtectedRoute exigirAssinatura><Dashboard /></ProtectedRoute>} />
          <Route path="/app/crm" element={<ProtectedRoute exigirAssinatura><Crm /></ProtectedRoute>} />
          <Route path="/app/ifood" element={<ProtectedRoute exigirAssinatura><Ifood /></ProtectedRoute>} />
          <Route path="/app/assinatura" element={<ProtectedRoute exigirAssinatura><Assinatura /></ProtectedRoute>} />
          <Route path="/app/creditos" element={<ProtectedRoute exigirAssinatura><Creditos /></ProtectedRoute>} />
        </Routes>
      </AssinaturaProvider>
    </Suspense>
  );
}
```

As rotas `/app/assinatura` e `/app/creditos` só passam a funcionar na Task 12; até lá o import quebra o build. Fazer a Task 12 antes de rodar o build, ou criar os dois arquivos vazios com `export default function X() { return null; }` e substituí-los na Task 12.

- [ ] **Step 10: Rodar a suíte do frontend**

Rodar: `npm --prefix frontend test`
Esperado: PASS. `App.test.tsx` pode precisar de ajuste — o provider passa a envolver as rotas e faz uma chamada a `/billing/status` no primeiro render.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/contexts/ frontend/src/components/ProtectedRoute.tsx frontend/src/pages/app/ frontend/src/App.tsx
git commit -m "feat: Trava o painel por assinatura e adiciona a tela de confirmacao" -m "Corrige tambem o redirecionamento do login, que apontava para /dashboard em vez de /app/dashboard e caia no 404." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Telas de assinatura, créditos e faixa de aviso de cota

**Files:**
- Create: `frontend/src/components/app/FaixaCota.tsx`
- Create: `frontend/src/components/app/FaixaCota.test.tsx`
- Create: `frontend/src/pages/app/Assinatura.tsx`
- Create: `frontend/src/pages/app/Creditos.tsx`
- Modify: `src/server.ts` (rota de extrato)

**Interfaces:**
- Consumes: `useAssinatura` (Task 11); `POST /api/billing/portal` e `POST /api/billing/pacote` (Task 7)
- Produces: `GET /api/billing/extrato`; componente `FaixaCota`; telas `/app/assinatura` e `/app/creditos`

- [ ] **Step 1: Escrever o teste da faixa**

Criar `frontend/src/components/app/FaixaCota.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FaixaCota from './FaixaCota';

let estado = { creditosCota: 10000, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };

vi.mock('../../contexts/AssinaturaContext', () => ({
  useAssinatura: () => estado,
}));

function montar() {
  return render(<MemoryRouter><FaixaCota /></MemoryRouter>);
}

describe('FaixaCota', () => {
  it('não aparece enquanto o consumo está abaixo de 80%', () => {
    estado = { creditosCota: 5000, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };
    const { container } = montar();
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa quando passa de 80% da cota', () => {
    estado = { creditosCota: 1500, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };
    montar();
    expect(screen.getByRole('status')).toHaveTextContent(/85% da sua cota/i);
  });

  it('avisa que a IA parou quando os dois saldos zeram', () => {
    estado = { creditosCota: 0, creditosAvulsos: 0, cotaTotal: 10000, carregando: false };
    montar();
    expect(screen.getByRole('alert')).toHaveTextContent(/deixou de responder/i);
  });

  // Quem comprou pacote continua sendo atendido mesmo com a cota zerada.
  // Dizer que a IA parou aí seria mentira e geraria compra desnecessária.
  it('não diz que a IA parou quando ainda há crédito avulso', () => {
    estado = { creditosCota: 0, creditosAvulsos: 2500, cotaTotal: 10000, carregando: false };
    montar();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/crédito avulso/i);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Rodar: `npm --prefix frontend test -- src/components/app/FaixaCota.test.tsx`
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a faixa**

Criar `frontend/src/components/app/FaixaCota.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const LIMIAR_AVISO = 0.8;

export default function FaixaCota() {
  const { creditosCota, creditosAvulsos, cotaTotal, carregando } = useAssinatura();

  if (carregando || cotaTotal <= 0) return null;

  const consumido = (cotaTotal - creditosCota) / cotaTotal;
  const cotaZerada = creditosCota <= 0;
  const semNadaSobrando = cotaZerada && creditosAvulsos <= 0;

  if (!semNadaSobrando && consumido < LIMIAR_AVISO) return null;

  if (semNadaSobrando) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
        <span>
          <strong>Seus créditos acabaram.</strong> A IA deixou de responder no
          WhatsApp até você recarregar.
        </span>
        <Link to="/app/creditos" className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white">
          Comprar créditos
        </Link>
      </div>
    );
  }

  const mensagem = cotaZerada
    ? `Sua cota mensal acabou. O atendimento segue com ${creditosAvulsos.toLocaleString('pt-BR')} de crédito avulso.`
    : `Você já usou ${Math.round(consumido * 100)}% da sua cota deste mês.`;

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
      <span>{mensagem}</span>
      <Link to="/app/creditos" className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white">
        Comprar créditos
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Rodar: `npm --prefix frontend test -- src/components/app/FaixaCota.test.tsx`
Esperado: PASS, 4 testes.

- [ ] **Step 5: Adicionar a rota de extrato no backend**

Em `src/server.ts`, junto das outras rotas de billing:

```ts
app.get('/api/billing/extrato', autenticar, async (req, res) => {
  const { data } = await supabaseAdmin
    .from('creditos_ia')
    .select('tipo_evento, creditos_consumidos, motivo_reembolso, origem, created_at')
    .eq('restaurante_id', req.restauranteId)
    .order('created_at', { ascending: false })
    .limit(50);

  return res.json({ success: true, lancamentos: data ?? [] });
});
```

- [ ] **Step 6: Criar a tela de assinatura**

Criar `frontend/src/pages/app/Assinatura.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container';
import FaixaCota from '../../components/app/FaixaCota';
import { apiFetch } from '../../services/api';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const ROTULO_STATUS: Record<string, string> = {
  ativa: 'Ativa',
  inadimplente: 'Pagamento pendente',
  pendente: 'Aguardando pagamento',
  cancelada: 'Cancelada',
  reembolsada: 'Reembolsada',
};

export default function Assinatura() {
  const { status, periodoFim, creditosCota, creditosAvulsos, cotaTotal } = useAssinatura();
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const abrirPortal = async () => {
    setErro(null);
    setAbrindo(true);

    try {
      const resposta = await apiFetch('/billing/portal', { method: 'POST' });
      const dados = await resposta.json();

      if (dados.success && dados.url) {
        window.location.href = dados.url;
        return;
      }

      setErro(dados.error || 'Não foi possível abrir o gerenciamento.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <>
      <FaixaCota />
      <Container className="py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink-800">Sua assinatura</h1>

        {status === 'inadimplente' && (
          <div role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            O último pagamento não foi aprovado. Atualize o cartão no
            gerenciamento — seu atendimento continua no ar enquanto isso.
          </div>
        )}

        <div className="mt-6 max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-600">Situação</dt>
              <dd className="font-semibold text-ink-800">{ROTULO_STATUS[status ?? 'pendente']}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Plano</dt>
              <dd className="font-semibold text-ink-800">R$ 179,99 /mês</dd>
            </div>
            {periodoFim && (
              <div className="flex justify-between">
                <dt className="text-ink-600">Próxima cobrança</dt>
                <dd className="font-semibold text-ink-800">
                  {new Date(periodoFim).toLocaleDateString('pt-BR')}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-stone-100 pt-4">
              <dt className="text-ink-600">Cota deste mês</dt>
              <dd className="font-semibold text-ink-800">
                {creditosCota.toLocaleString('pt-BR')} de {cotaTotal.toLocaleString('pt-BR')}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Créditos avulsos</dt>
              <dd className="font-semibold text-ink-800">{creditosAvulsos.toLocaleString('pt-BR')}</dd>
            </div>
          </dl>

          {erro && (
            <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button onClick={abrirPortal} disabled={abrindo}
              className="w-full rounded-lg bg-brand-700 p-3 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
              {abrindo ? 'Abrindo...' : 'Gerenciar assinatura'}
            </button>
            <Link to="/app/creditos"
              className="block w-full rounded-lg border border-stone-300 p-3 text-center text-sm font-bold text-ink-800 transition-colors hover:bg-stone-50">
              Comprar créditos
            </Link>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-stone-500">
            No gerenciamento você cancela a assinatura, troca o cartão e baixa
            suas faturas. É o ambiente seguro do Stripe.
          </p>
        </div>
      </Container>
    </>
  );
}
```

- [ ] **Step 7: Criar a tela de créditos**

Criar `frontend/src/pages/app/Creditos.tsx`:

```tsx
import { useEffect, useState } from 'react';
import Container from '../../components/ui/Container';
import FaixaCota from '../../components/app/FaixaCota';
import { apiFetch } from '../../services/api';
import { useAssinatura } from '../../contexts/AssinaturaContext';

const PACOTES = [
  { id: 'creditos_2500', rotulo: '2.500 créditos', preco: 'R$ 59,90' },
  { id: 'creditos_5000', rotulo: '5.000 créditos', preco: 'R$ 109,90' },
  { id: 'creditos_10000', rotulo: '10.000 créditos', preco: 'R$ 199,90' },
];

interface Lancamento {
  tipo_evento: string;
  creditos_consumidos: number;
  motivo_reembolso: string | null;
  origem: string | null;
  created_at: string;
}

export default function Creditos() {
  const { creditosCota, creditosAvulsos, recarregar } = useAssinatura();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);

  useEffect(() => {
    // Voltar do Stripe com ?compra=ok significa que o webhook pode já ter
    // creditado: recarregar para o saldo na tela não ficar velho.
    if (new URLSearchParams(window.location.search).get('compra') === 'ok') {
      void recarregar();
    }

    void (async () => {
      try {
        const resposta = await apiFetch('/billing/extrato');
        const dados = await resposta.json();
        if (dados.success) setLancamentos(dados.lancamentos);
      } catch {
        // Extrato é secundário: falhar aqui não pode esconder os pacotes.
      }
    })();
  }, [recarregar]);

  const comprar = async (pacoteId: string) => {
    setErro(null);
    setComprando(pacoteId);

    try {
      const resposta = await apiFetch('/billing/pacote', {
        method: 'POST',
        body: JSON.stringify({ pacoteId }),
      });
      const dados = await resposta.json();

      if (dados.success && dados.url) {
        window.location.href = dados.url;
        return;
      }

      setErro(dados.error || 'Não foi possível abrir a compra.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setComprando(null);
    }
  };

  return (
    <>
      <FaixaCota />
      <Container className="py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink-800">Créditos</h1>
        <p className="mt-3 text-ink-600">
          Cota deste mês: <strong>{creditosCota.toLocaleString('pt-BR')}</strong> ·
          Avulsos: <strong>{creditosAvulsos.toLocaleString('pt-BR')}</strong>
        </p>
        <p className="mt-1 text-sm text-stone-500">
          A cota reseta todo mês. Créditos avulsos não expiram e só são usados
          depois que a cota acaba.
        </p>

        {erro && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PACOTES.map((pacote) => (
            <div key={pacote.id} className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
              <p className="font-semibold text-ink-800">{pacote.rotulo}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-ink-800">{pacote.preco}</p>
              <button onClick={() => comprar(pacote.id)} disabled={comprando !== null}
                className="mt-5 w-full rounded-lg bg-brand-700 p-3 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
                {comprando === pacote.id ? 'Abrindo...' : 'Comprar'}
              </button>
            </div>
          ))}
        </div>

        <h2 className="mt-12 text-xs font-bold uppercase tracking-wider text-stone-400">
          Últimos lançamentos
        </h2>

        {lancamentos.length === 0 ? (
          <p className="mt-4 text-sm text-ink-600">Nenhum consumo registrado ainda.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-stone-400">
                <tr>
                  <th scope="col" className="py-2">Quando</th>
                  <th scope="col" className="py-2">Tipo</th>
                  <th scope="col" className="py-2">Origem</th>
                  <th scope="col" className="py-2 text-right">Créditos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lancamentos.map((l, i) => (
                  <tr key={`${l.created_at}-${i}`}>
                    <td className="py-2.5 text-ink-600">
                      {new Date(l.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 text-ink-800">
                      {l.motivo_reembolso ? 'Estorno' : l.tipo_evento}
                    </td>
                    <td className="py-2.5 text-ink-600">{l.origem ?? '—'}</td>
                    <td className={`py-2.5 text-right font-semibold ${l.creditos_consumidos < 0 ? 'text-brand-700' : 'text-ink-800'}`}>
                      {l.creditos_consumidos < 0 ? '+' : '−'}
                      {Math.abs(l.creditos_consumidos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    </>
  );
}
```

- [ ] **Step 8: Rodar as duas suítes**

Rodar: `npm --prefix frontend test`
Rodar: `npm test`
Esperado: PASS nas duas.

- [ ] **Step 9: Conferir o build**

Rodar: `npm --prefix frontend run build`
Esperado: build sem erro de TypeScript.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/app/ frontend/src/pages/app/Assinatura.tsx frontend/src/pages/app/Creditos.tsx src/server.ts
git commit -m "feat: Adiciona as telas de assinatura, creditos e aviso de cota" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: Verificação de ponta a ponta

Nenhuma tarefa anterior exercitou o caminho completo com o Stripe real em modo de teste.

**Files:** nenhum — é validação.

**Interfaces:**
- Consumes: tudo
- Produces: confiança de que o fluxo funciona

- [ ] **Step 1: Criar os produtos no Stripe (modo de teste)**

No painel do Stripe, em modo de teste, criar:

- Produto "AtendIA — Assinatura mensal", preço recorrente mensal de R$ 179,99. Copiar o price id para `STRIPE_PRICE_ASSINATURA`.
- Produto "2.500 créditos", preço avulso de R$ 59,90 → `STRIPE_PRICE_CREDITOS_2500`.
- Produto "5.000 créditos", preço avulso de R$ 109,90 → `STRIPE_PRICE_CREDITOS_5000`.
- Produto "10.000 créditos", preço avulso de R$ 199,90 → `STRIPE_PRICE_CREDITOS_10000`.

Ativar o Customer Portal em Settings → Billing → Customer portal, permitindo cancelamento e troca de método de pagamento.

- [ ] **Step 2: Encaminhar os webhooks para a máquina local**

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copiar o `whsec_...` que a CLI imprime para `STRIPE_WEBHOOK_SECRET` e reiniciar o backend.

- [ ] **Step 3: Percorrer o fluxo inteiro**

Com backend (`npm run dev`) e frontend (`npm --prefix frontend run dev`) rodando:

1. Abrir `http://localhost:5173/cadastro` e criar uma conta com CNPJ válido.
2. Confirmar que caiu em `/assinatura/pagamento`.
3. Clicar em "Ir para o pagamento" e pagar com o cartão de teste `4242 4242 4242 4242`, validade futura, CVC qualquer.
4. Confirmar que a tela de confirmação some sozinha e o painel abre.
5. No SQL Editor do Supabase: `SELECT status FROM assinaturas WHERE restaurante_id = '...'` → `ativa`; `SELECT creditos_cota FROM restaurantes WHERE id = '...'` → `10000`.

- [ ] **Step 4: Conferir a idempotência**

Na aba Events do Stripe, reenviar o `checkout.session.completed` do passo anterior.

Esperado: log "já processado" no backend e `creditos_cota` continuando em 10.000, não 20.000.

- [ ] **Step 5: Conferir a compra de pacote**

Em `/app/creditos`, comprar o pacote de 2.500 com o mesmo cartão de teste.

Esperado: `creditos_avulsos` = 2.500 e `creditos_cota` inalterada.

- [ ] **Step 6: Conferir a trava e a faixa de aviso**

```sql
UPDATE restaurantes SET creditos_cota = 0, creditos_avulsos = 0 WHERE id = '...';
```

Recarregar o painel. Esperado: faixa vermelha dizendo que a IA deixou de responder.

```sql
UPDATE assinaturas SET status = 'pendente' WHERE restaurante_id = '...';
```

Recarregar. Esperado: redirecionamento para `/assinatura/pagamento`, e `GET /api/dashboard/metricas` devolvendo 402.

- [ ] **Step 7: Conferir o cancelamento**

Em `/app/assinatura`, clicar em "Gerenciar assinatura", cancelar pelo portal do Stripe e voltar.

Esperado: `assinaturas.status` = `cancelada`, `creditos_cota` = 0, `creditos_avulsos` preservado em 2.500.

- [ ] **Step 8: Registrar o resultado**

Anotar no final do spec, em uma seção "Verificação", a data e o que foi validado. Commitar.

```bash
git add docs/superpowers/specs/2026-08-02-ciclo2-cadastro-cobranca-design.md
git commit -m "docs: Registra a verificacao de ponta a ponta do ciclo 2" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Pendências fora do código

- **Conta Stripe em nome do MEI.** É a única dependência bloqueante. Confirmar que o MEI passa no cadastro antes de começar a Task 6.
- **Ciclo 3:** provisionar Resend, Meta/WhatsApp Cloud API, OpenAI, Groq e iFood; onboarding (WhatsApp e cardápio nos quatro formatos); ligar o TTS; e-mail transacional e recuperação de senha.
