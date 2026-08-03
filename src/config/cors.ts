import type { CorsOptions } from 'cors';
import { env } from './env.js';

// Origem de desenvolvimento local, sempre liberada independente do ambiente,
// para o frontend rodando com `npm run dev` (Vite) continuar funcionando.
const ORIGEM_LOCALHOST_DEV = 'http://localhost:5173';

// Constrói a variante "www." de uma origem, preservando protocolo e porta.
// Ex.: "https://atendiarp.com.br" -> "https://www.atendiarp.com.br".
function obterVariacaoComWww(origem: string): string | undefined {
  try {
    const url = new URL(origem);
    if (url.hostname.startsWith('www.')) {
      return undefined;
    }
    url.hostname = `www.${url.hostname}`;
    // url.origin já descarta path/query/hash, sobrando só protocolo+host+porta.
    return url.origin;
  } catch {
    return undefined;
  }
}

// Monta a lista de origens permitidas a partir da URL do frontend (APP_URL).
// Inclui a própria URL, a variante com "www." (os dois hostnames servem o
// mesmo site) e o localhost de desenvolvimento.
export function obterOrigensPermitidas(appUrl: string): string[] {
  const origens = new Set<string>([appUrl, ORIGEM_LOCALHOST_DEV]);
  const variacaoComWww = obterVariacaoComWww(appUrl);
  if (variacaoComWww) {
    origens.add(variacaoComWww);
  }
  return Array.from(origens);
}

// Decide se uma origem pode acessar a API.
//
// Ausência de `origin` (undefined) precisa ser sempre permitida: é assim que
// chegam chamadas servidor-a-servidor, como o health check do Render e os
// webhooks do Stripe e da Meta — eles não enviam o cabeçalho Origin porque
// não são requisições de navegador. Bloquear esse caso quebraria cobrança e
// atendimento.
//
// A comparação é por igualdade exata da string, nunca por `startsWith`: uma
// origem como "https://atendiarp.com.br.evil.com" começa com a origem
// permitida mas é um domínio completamente diferente, e deve ser recusada.
export function origemEhPermitida(
  origin: string | undefined,
  origensPermitidas: string[],
): boolean {
  if (!origin) {
    return true;
  }
  return origensPermitidas.includes(origin);
}

const origensPermitidas = obterOrigensPermitidas(env.APP_URL);

// Opções de CORS usadas pelo middleware `cors()` no server.ts. Sem
// `credentials: true` de propósito: a autenticação da API é por Bearer
// token, não por cookie, então não há necessidade de liberar credenciais.
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (origemEhPermitida(origin, origensPermitidas)) {
      callback(null, true);
      return;
    }
    // Recusa "limpa": passa `false` em vez de lançar um Error, para não gerar
    // stack trace nem derrubar a requisição a cada origem não permitida.
    callback(null, false);
  },
};
