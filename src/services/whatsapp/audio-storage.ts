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
