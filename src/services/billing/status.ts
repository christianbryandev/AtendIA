import { supabaseAdmin } from '../../config/supabase.js';
import { getStripe } from './stripe-client.js';
import { atualizarStatus, buscarAssinatura } from './assinatura-repo.js';
import { CREDITOS_DA_COTA } from './cota.js';
import { periodoFimDaSubscription } from './periodo.js';

const MINUTOS_ATE_RECONCILIAR = 5;

// A tela de confirmação de pagamento do frontend faz polling de
// GET /api/billing/status a cada poucos segundos enquanto a assinatura
// está pendente, e o lojista pode deixar a aba aberta. Sem um teto, isso
// vira uma rajada de chamadas `subscriptions.list` ao Stripe sem limite,
// com risco de rate limit e custo. Este mapa em memória garante no máximo
// uma consulta ao Stripe por restaurante a cada 60s; nas requisições
// dentro dessa janela devolvemos o status que já está no banco. O
// backend roda como um processo só, então perder esse estado num
// restart é inofensivo.
const JANELA_ENTRE_CONSULTAS_MS = 60_000;
const ultimaConsultaStripePorRestaurante = new Map<string, number>();

// Evita que o mapa cresça sem limite: qualquer entrada mais velha que a
// janela já não bloqueia mais ninguém, então não serve pra nada.
function limparEntradasVelhas(agora: number): void {
  for (const [restauranteId, timestamp] of ultimaConsultaStripePorRestaurante) {
    if (agora - timestamp >= JANELA_ENTRE_CONSULTAS_MS) {
      ultimaConsultaStripePorRestaurante.delete(restauranteId);
    }
  }
}

// Exportado só para os testes resetarem o estado do módulo entre casos.
export function _resetLimiteDeConsultaStripeParaTeste(): void {
  ultimaConsultaStripePorRestaurante.clear();
}

function podeConsultarStripe(restauranteId: string): boolean {
  const agora = Date.now();
  limparEntradasVelhas(agora);

  const ultima = ultimaConsultaStripePorRestaurante.get(restauranteId);
  if (ultima !== undefined && agora - ultima < JANELA_ENTRE_CONSULTAS_MS) {
    return false;
  }

  ultimaConsultaStripePorRestaurante.set(restauranteId, agora);
  return true;
}

/**
 * Credita a cota mensal do plano na reconciliação.
 *
 * A RPC RESETA o saldo em vez de somar, então chamar aqui é seguro
 * mesmo que o webhook atrasado chegue depois e chame de novo: o
 * resultado continua sendo a cota cheia, nunca o dobro.
 *
 * supabase-js não lança em erro de RPC, devolve { data, error } — sem
 * olhar o `error`, uma falha do banco passaria como sucesso.
 */
async function creditarCotaDaReconciliacao(restauranteId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('resetar_cota_mensal', {
    p_restaurante_id: restauranteId,
    p_qtd: CREDITOS_DA_COTA,
  });

  if (error) {
    throw new Error(
      `[Billing] RPC resetar_cota_mensal falhou na reconciliacao do restaurante ${restauranteId}: ${error.message}`,
    );
  }
}

/**
 * Resultado da reconciliação: o status (sempre presente) e, só quando a
 * reconciliação de fato atualizou o banco, o novo `periodoFim`. Quando
 * `periodoFim` vem `undefined`, nada mudou e quem chamou deve continuar
 * usando o valor que já tinha lido do banco antes de reconciliar.
 */
export interface ResultadoReconciliacao {
  status: string;
  periodoFim?: string | null;
}

/**
 * Rede de segurança para webhook perdido: se a conta está pendente há
 * mais que alguns minutos, pergunta ao Stripe e se corrige. É a
 * reconciliação sob demanda, sem cron.
 *
 * Devolve o `periodoFim` novo só quando a reconciliação realmente grava
 * no banco: quem chama fez a leitura da linha ANTES desta função rodar,
 * então usar o status novo com o periodoFim antigo misturaria dado velho
 * com novo na mesma resposta.
 */
export async function reconciliarSePreciso(
  restauranteId: string,
  criadaEm: string,
  status: string,
): Promise<ResultadoReconciliacao> {
  if (status !== 'pendente') return { status };

  const minutosDesde = (Date.now() - new Date(criadaEm).getTime()) / 60_000;
  if (minutosDesde < MINUTOS_ATE_RECONCILIAR) return { status };

  if (!podeConsultarStripe(restauranteId)) return { status };

  const assinatura = await buscarAssinatura(restauranteId);
  if (!assinatura?.stripeCustomerId) return { status };

  try {
    const { data } = await getStripe().subscriptions.list({
      customer: assinatura.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    const subscription = data[0];
    if (!subscription) return { status };

    // A cota vem ANTES do status, de propósito. Quem credita a cota
    // normalmente é o webhook — e esta reconciliação existe justamente
    // para o caso em que ele nunca chegou. Sem creditar aqui, o lojista
    // pagou, o painel abre e a IA continua muda até a renovação, um mês
    // depois, sem alarme nenhum.
    //
    // A ordem importa: se marcássemos 'ativa' primeiro e a RPC falhasse,
    // a reconciliação nunca mais rodaria (ela só age sobre 'pendente') e
    // a cota ficaria perdida para sempre. Creditando antes, uma falha
    // deixa o status em 'pendente' e a próxima consulta tenta de novo.
    await creditarCotaDaReconciliacao(restauranteId);

    const periodoFim = periodoFimDaSubscription(subscription);

    await atualizarStatus(restauranteId, {
      status: 'ativa',
      stripeSubscriptionId: subscription.id,
      periodoFim,
    });

    return { status: 'ativa', periodoFim };
  } catch (erro) {
    // Stripe indisponível não pode virar erro na tela do lojista.
    console.error('[Billing] Falha ao reconciliar com o Stripe:', erro);
    return { status };
  }
}
