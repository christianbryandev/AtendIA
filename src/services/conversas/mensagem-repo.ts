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
