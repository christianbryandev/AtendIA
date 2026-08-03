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

    await marcarStatus(restauranteId, id, 'ok');
    await registrarMensagemNossa(restauranteId, telefone, new Date().toISOString());
    return { ok: true, id };
  } catch (erro: any) {
    await marcarStatus(restauranteId, id, 'falha', erro?.message ?? 'Erro desconhecido');
    return { ok: false, erro: 'Não foi possível entregar a mensagem. Tente novamente.' };
  }
}
