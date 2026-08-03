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
