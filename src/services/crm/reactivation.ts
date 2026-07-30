import { supabase } from '../../config/supabase.js';
import { sendWhatsAppTextMessage } from '../whatsapp/meta-cloud-api.js';

interface UpsertCustomerParams {
  restauranteId: string;
  telefoneWhatsApp: string;
  nome?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  complemento?: string;
}

/**
 * 1. Organização da base de contatos & Implantação do CRM
 * Salva ou atualiza um cliente no CRM com tags automáticas e histórico.
 */
export async function upsertCustomerInCRM(params: UpsertCustomerParams) {
  const { data: existingCustomer } = await supabase
    .from('clientes_crm')
    .select('*')
    .eq('restaurante_id', params.restauranteId)
    .eq('telefone_whatsapp', params.telefoneWhatsApp)
    .single();

  const now = new Date().toISOString();

  if (existingCustomer) {
    // Atualiza cadastro mantendo histórico acumulado e flag de ultima mensagem
    const { data: updated } = await supabase
      .from('clientes_crm')
      .update({
        nome: params.nome || existingCustomer.nome,
        logradouro: params.logradouro || existingCustomer.logradouro,
        numero: params.numero || existingCustomer.numero,
        bairro: params.bairro || existingCustomer.bairro,
        cidade: params.cidade || existingCustomer.cidade,
        complemento: params.complemento || existingCustomer.complemento,
        updated_at: now,
        ultima_mensagem_em: now,
      })
      .eq('id', existingCustomer.id)
      .select()
      .single();

    return updated;
  } else {
    // Cria novo contato na base com estagio 'novo_contato'
    const { data: created } = await supabase
      .from('clientes_crm')
      .insert({
        restaurante_id: params.restauranteId,
        telefone_whatsapp: params.telefoneWhatsApp,
        nome: params.nome,
        logradouro: params.logradouro,
        numero: params.numero,
        bairro: params.bairro,
        cidade: params.cidade,
        complemento: params.complemento,
        estagio_pipeline: 'novo_contato',
        ultima_mensagem_em: now,
        opt_in_marketing: true,
      })
      .select()
      .single();

    if (created) {
      await supabase.from('historico_crm').insert({
        cliente_id: created.id,
        estagio_novo: 'novo_contato',
        motivo: 'evento_pedido'
      });
    }

    return created;
  }
}

/**
 * 2. Estratégias de Fidelização: Adiciona pontos de fidelidade pós-pedido.
 */
export async function addLoyaltyPoints(clienteCrmId: string, valorPedido: number) {
  // Exemplo de regra: 1 Ponto a cada R$ 10,00 gastos
  const pontosGanhos = Math.floor(valorPedido / 10);
  if (pontosGanhos <= 0) return;

  const { data: cliente } = await supabase
    .from('clientes_crm')
    .select('pontos_fidelidade')
    .eq('id', clienteCrmId)
    .single();

  if (!cliente) return;

  const novosPontos = (cliente.pontos_fidelidade || 0) + pontosGanhos;

  await supabase
    .from('clientes_crm')
    .update({ pontos_fidelidade: novosPontos })
    .eq('id', clienteCrmId);
}

/**
 * 3. Campanhas de Reativação de Clientes Ausentes (ex: sem comprar há 15 ou 30 dias).
 */
export async function runReactivationCampaign(restauranteId: string, diasAusente = 15) {
  const dataCorte = new Date();
  dataCorte.setDate(dataCorte.getDate() - diasAusente);

  // Busca clientes que compraram antes da data de corte e estão marcados com opt-in
  const { data: clientesAusentes } = await supabase
    .from('clientes_crm')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('opt_in_marketing', true)
    .lt('ultimo_pedido_at', dataCorte.toISOString());

  if (!clientesAusentes || clientesAusentes.length === 0) {
    return { disparados: 0, mensagem: 'Nenhum cliente ausente encontrado para o período.' };
  }

  let disparados = 0;

  for (const cliente of clientesAusentes) {
    const nomeCliente = cliente.nome ? cliente.nome.split(' ')[0] : 'amigo(a)';
    const mensagemReativacao = `Olá ${nomeCliente}! Sentimos sua falta por aqui no delivery! 🍔\n\nQue tal um cupom de 10% OFF para matar a saudade hoje? Use o cupom VOLTEI10 no seu próximo pedido pelo WhatsApp!`;

    try {
      await sendWhatsAppTextMessage({
        toPhoneNumber: cliente.telefone_whatsapp,
        text: mensagemReativacao,
      });

      // Atualiza tag do cliente para 'em_reativacao'
      await supabase
        .from('clientes_crm')
        .update({ tags: ['em_reativacao'] })
        .eq('id', cliente.id);

      disparados++;
    } catch (err) {
      console.error(`[Reativação CRM Error] Falha ao disparar para ${cliente.telefone_whatsapp}:`, err);
    }
  }

  return { disparados, mensagem: `Campanha executada. ${disparados} mensagens de reativação enviadas!` };
}
