import { supabaseAdmin } from '../../config/supabase.js';
import { enviarEmail } from '../email/resend-client.js';
import { templateCotaEsgotada } from '../email/templates.js';

/**
 * Dispara o e-mail de cota esgotada, no máximo uma vez por ciclo de
 * cobrança. Pendência do ciclo 2, ligada aqui junto com o Resend.
 *
 * A trava compara `assinaturas.periodo_fim` com o valor gravado em
 * `restaurantes.aviso_cota_esgotada_periodo_fim`, e não um booleano
 * resetado em outro lugar (ver migration 010 para o motivo completo):
 * um booleano dependeria de uma rotina separada para zerá-lo a cada
 * ciclo (por exemplo, dentro da RPC resetar_cota_mensal, chamada pelo
 * webhook do Stripe em invoice.paid) e, se essa rotina falhasse ou
 * deixasse de rodar, a trava ficaria presa para sempre — o restaurante
 * nunca mais receberia o aviso, sem nenhum sinal do problema.
 * Guardando qual `periodo_fim` já foi avisado, a trava se autocorrige:
 * quando o Stripe faz o ciclo virar, `periodo_fim` muda sozinho, deixa
 * de bater com o valor gravado, e o aviso volta a sair no próximo
 * esgotamento, sem nada para resetar.
 *
 * Não lança em nenhum caso: uma falha aqui (banco fora do ar, Resend
 * indisponível) não pode derrubar o fluxo do webhook do WhatsApp que a
 * chama.
 */
export async function avisarCotaEsgotadaSeNecessario(restauranteId: string): Promise<void> {
  const { data: assinatura, error: erroAssinatura } = await supabaseAdmin
    .from('assinaturas')
    .select('periodo_fim')
    .eq('restaurante_id', restauranteId)
    .maybeSingle();

  if (erroAssinatura) {
    console.error('[AvisoCota] Erro ao buscar a assinatura:', erroAssinatura);
    return;
  }

  const periodoFim = assinatura?.periodo_fim as string | null | undefined;

  // Sem período conhecido não há como saber se este é um esgotamento
  // "novo" ou o mesmo de sempre — melhor não avisar do que arriscar
  // mandar um e-mail a cada mensagem recebida.
  if (!periodoFim) return;

  const { data: restaurante, error: erroRestaurante } = await supabaseAdmin
    .from('restaurantes')
    .select('nome, aviso_cota_esgotada_periodo_fim')
    .eq('id', restauranteId)
    .maybeSingle();

  if (erroRestaurante || !restaurante) {
    console.error('[AvisoCota] Erro ao buscar o restaurante:', erroRestaurante);
    return;
  }

  if (restaurante.aviso_cota_esgotada_periodo_fim === periodoFim) {
    // Já avisado neste mesmo ciclo.
    return;
  }

  const { data: usuarios, error: erroUsuarios } = await supabaseAdmin
    .from('usuarios')
    .select('email')
    .eq('restaurante_id', restauranteId);

  if (erroUsuarios || !usuarios || usuarios.length === 0) {
    console.error('[AvisoCota] Erro ao buscar os usuarios do restaurante:', erroUsuarios);
    return;
  }

  const { subject, html } = templateCotaEsgotada(restaurante.nome as string);

  try {
    await Promise.all(
      usuarios.map((usuario: { email: string }) => enviarEmail({ to: usuario.email, subject, html })),
    );
  } catch (erroEnvio) {
    console.error('[AvisoCota] Erro ao enviar o e-mail de cota esgotada:', erroEnvio);
    // Não marca como avisado: se o envio falhou, o próximo esgotamento
    // deste mesmo ciclo tenta de novo.
    return;
  }

  const { error: erroAtualizacao } = await supabaseAdmin
    .from('restaurantes')
    .update({ aviso_cota_esgotada_periodo_fim: periodoFim })
    .eq('id', restauranteId);

  if (erroAtualizacao) {
    console.error('[AvisoCota] Erro ao marcar o aviso como enviado:', erroAtualizacao);
  }
}
