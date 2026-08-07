# AtendIA

SaaS de delivery com atendimento por IA no WhatsApp. O cliente manda mensagem (texto ou áudio), a IA responde com o cardápio real do restaurante, mantém contexto entre mensagens e monta o pedido. O lojista acompanha num painel em tempo real e pode assumir a conversa a qualquer momento.

**Está em produção com um restaurante real sendo atendido.** Frontend na Vercel (`atendiarp.com.br`), backend no Render (`atendia-wqdz.onrender.com`), banco no Supabase. Deploy é automático a partir da `main` — **mergear na main é publicar em produção**.

## Estrutura

São **dois projetos npm separados**:

- Raiz — backend Node + Express + TypeScript (ESM), Vitest
- `frontend/` — React 19 + Vite + React Router 7 + Tailwind, Vitest + Testing Library

## Comandos

```bash
npm test                        # backend
npx tsc --noEmit                # checagem de tipos do backend
npm run build                   # backend (usa tsconfig.build.json)

npm --prefix frontend test      # frontend (~150s)
npm --prefix frontend run build
npm --prefix frontend run lint  # oxlint
```

## Convenções que não podem ser quebradas

- **Tudo em português brasileiro** — código, comentários, commits, interface, mensagens de erro de API.
- **Commits:** `tipo: Descrição no imperativo`, **sem acentos no título**, com rodapé `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Imports em `src/` levam extensão `.js`** — o projeto é ESM (`"type": "module"`).
- **`supabaseAdmin` usa a service_role e faz bypass de RLS.** Filtrar por `restaurante_id` explicitamente, **sempre**, em SELECT, UPDATE e DELETE. A coluna é `restaurante_id` — nunca `empresa_id`.
- **O cliente do Supabase não lança sozinho.** Todo `{ data, error }` precisa ter o `error` verificado. Descartar o `error` já causou três defeitos neste projeto — uma falha de rede virava "conversa nova" e a IA respondia sem memória.
- **Migrations idempotentes** (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`), no padrão da `006`, `009` e `011`.
- **Funções novas no banco:** `SECURITY DEFINER`, `SET search_path = public, pg_temp`, e o par `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role`. A migration `005` fechou uma vulnerabilidade real de crédito ilimitado via PostgREST; um `REVOKE` esquecido a reabre.
- **`CREATE OR REPLACE` de RPC existente exige assinatura idêntica.** Assinatura diferente cria função nova, e os `REVOKE`/`GRANT` não se aplicam a ela.
- **Token da Meta sempre cifrado** (`src/utils/crypto.ts`). Senha sempre bcrypt. **Nenhuma rota devolve token**, nem cifrado.
- **Paleta da marca no frontend:** `brand-*`, `ink-*`, `stone-*`. `sky-*` e `blue-*` são de telas antigas.
  **Cor que carrega significado fica; cromo muda.** O Kanban do CRM e os cards do Dashboard usam cor para sinalizar estado, e `brand-500` é igual ao `emerald-500` — trocar deixaria estágios indistinguíveis.
- **Acessibilidade:** label associado a cada campo, `role="alert"` nos erros, `aria-current="page"` no item de menu ativo.
- **Custo em créditos:** texto = 1, imagem = 3, áudio = 8. Cota mensal de 10.000.

## Armadilhas já descobertas

- **`npm run build` usa `tsconfig.build.json`, que exclui os testes.** Sem isso o deploy quebra, porque `tsc` compilaria os `.test.ts` que importam vitest.
- **`NODE_ENV=production` faz o npm pular devDependencies** — o build no Render precisa de `npm install --include=dev`.
- **`SUPABASE_URL` com `/rest/v1/` no fim quebra tudo em silêncio** (já protegido no boot).
- **`APP_URL` com barra final bloquearia o CORS do próprio site** (já normalizado).
- **A suíte do frontend leva ~150s e falha 1 em cada 3 execuções por timeout**, tipicamente em `App.test.tsx`. Confirme que é timeout antes de concluir que quebrou algo.
- **`src/database/creditos.test.ts` e `src/database/isolamento-realtime.test.ts` escrevem no Supabase real.** Não alterar. Testes novos que toquem o banco real criam fixtures com id próprio e as apagam mesmo em caso de falha.
- **O `.env` local tem `META_APP_SECRET` de exemplo.** Produção está correta; testar webhook localmente não funciona por causa disso.
- **Variáveis `VITE_` entram no bundle no build.** Definir na Vercel sem redeploy não faz efeito.

## Regras de negócio que moldam o código

- **Janela de 24 horas da Meta:** só dá para mandar texto livre até 24h após a última mensagem **do cliente**. Fora disso, só template aprovado. A trava é **no servidor** (`src/services/conversas/envio.ts`); o campo desabilitado na tela é conveniência.
- **A IA pausa quando o lojista assume** e volta sozinha após 30 min sem mensagem nova — avaliado na chegada da próxima mensagem, sem cron.
- **O cardápio é a fonte de verdade da IA.** Ela só oferece o que está cadastrado, com os preços cadastrados. `montarTextoDoCardapio` **inclui o ID do produto** porque a ferramenta `finalizar_pedido` depende dele — remover quebra a finalização de pedido.
- **Conectar o WhatsApp exige três etapas independentes** na Meta: URL do webhook verificada, campo `messages` assinado, e **o app inscrito na WABA** (`POST /{waba-id}/subscribed_apps`). Ter duas não adianta nada. A terceira ainda é feita manualmente e é uma falha silenciosa — a tela mostra "conectado" e nenhuma mensagem chega.

## Onde ler o resto

- **`.superpowers/sdd/progress.md`** (gitignored) — histórico completo de decisões, defeitos encontrados em revisão e lições de depuração.
- **`docs/superpowers/specs/`** e **`docs/superpowers/plans/`** — specs e planos por ciclo.

## Como trabalhar

O projeto usa as skills do **superpowers**. O padrão que funciona é **subagent-driven-development**: um subagente por tarefa, revisão entre cada uma. As revisões dos ciclos 2 e 3 pegaram onze defeitos que teriam ido para produção — entre eles um token de recuperação de senha que não era de uso único, enumeração de e-mails por tempo de resposta, e uma policy de RLS que deixava o navegador adulterar a janela da Meta.
