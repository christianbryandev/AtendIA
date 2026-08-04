import { supabaseAdmin } from '../../config/supabase.js';
import { downloadWhatsAppMedia } from './meta-cloud-api.js';

const BUCKET = 'audios-whatsapp';

export interface ResultadoSalvarAudio {
  caminho: string | null;
  buffer: Buffer | null;
}

/**
 * Baixa o áudio da Meta e guarda no Supabase Storage.
 *
 * O link que a Meta devolve expira em pouco tempo, então guardar depois
 * não é possível: ou baixamos no instante em que a mensagem chega, ou o
 * áudio se perde. O bucket é privado; a leitura acontece por URL
 * assinada, gerada sob demanda pela nossa API.
 *
 * Devolve também o buffer baixado para quem chamou reaproveitar (ex.: a
 * transcrição), evitando baixar o mesmo áudio da Meta duas vezes — o que
 * dobraria a latência do atendimento por áudio e criaria uma segunda
 * dependência do link que expira rápido.
 *
 * Devolve caminho e buffer null em caso de falha ao BAIXAR, de propósito:
 * perder o áudio não pode impedir o atendimento.
 *
 * Se o download funcionar mas o Storage falhar (ex.: bucket ainda não
 * criado), o caminho fica null mas o buffer baixado é devolvido mesmo
 * assim — a transcrição precisa continuar funcionando mesmo sem o áudio
 * guardado.
 */
export async function salvarAudioDaMeta(
  mediaId: string,
  token: string,
  restauranteId: string,
): Promise<ResultadoSalvarAudio> {
  let buffer: Buffer;
  try {
    buffer = await downloadWhatsAppMedia(mediaId, token);
  } catch (erro) {
    console.error('[Audio] Falha ao baixar da Meta:', erro);
    return { caminho: null, buffer: null };
  }

  try {
    const caminho = `${restauranteId}/${mediaId}.ogg`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(caminho, buffer, { contentType: 'audio/ogg', upsert: true });

    if (error) {
      console.error('[Audio] Falha ao guardar no Storage:', error.message);
      return { caminho: null, buffer };
    }

    return { caminho, buffer };
  } catch (erro) {
    console.error('[Audio] Falha ao guardar no Storage:', erro);
    return { caminho: null, buffer };
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
