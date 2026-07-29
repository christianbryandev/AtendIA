import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

interface ProcessCustomerMessageParams {
  restauranteId: string;
  telefoneCliente: string;
  mensagemTexto: string;
  historicoConversa?: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * Cérebro de IA do Atendente Virtual de Vendas.
 * Processa a mensagem do cliente no WhatsApp, consulta o cardápio e executa ações de venda.
 */
export async function processCustomerMessageWithAI(params: ProcessCustomerMessageParams) {
  const { restauranteId, telefoneCliente, mensagemTexto, historicoConversa = [] } = params;

  if (!openai) {
    return {
      respostaTexto: `Olá! Seu pedido de "${mensagemTexto}" foi anotado. O total fica R$ 45,00. Segue a chave Pix Copia e Cola para pagamento.`,
      pedidoCriado: null,
    };
  }

  // 1. Busca dados do Restaurante & Cardápio no banco
  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('id', restauranteId)
    .single();

  const { data: produtos } = await supabase
    .from('produtos_cardapio')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('disponivel', true);

  // 2. Busca histórico do cliente no CRM
  const { data: clienteCrm } = await supabase
    .from('clientes_crm')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('telefone_whatsapp', telefoneCliente)
    .single();

  const cardapioFormatado = (produtos || []).map(p => 
    `- ${p.nome} (${p.categoria}): R$ ${p.preco.toFixed(2)} | Descrição: ${p.descricao || 'Sem descrição'}`
  ).join('\n');

  const historicoUltimoPedido = clienteCrm?.ultimo_pedido_json 
    ? JSON.stringify(clienteCrm.ultimo_pedido_json)
    : 'Nenhum pedido anterior.';

  const systemPrompt = `
Você é o atendente de vendas de IA humanizado do restaurante "${restaurante?.nome || 'Delivery'}".
Seu tom de voz é: ${restaurante?.tom_voz_ia || 'Amigável, rápido e descontraído'}.
Instruções personalizadas do restaurante: ${restaurante?.instrucoes_personalizadas || 'Nenhuma instrução adicional.'}

REGRAS DE ATENDIMENTO:
1. Atenda o cliente pelo nome se disponível (${clienteCrm?.nome || 'amigo(a)'}).
2. Se o cliente for recorrente e perguntar do último pedido, consulte o histórico: ${historicoUltimoPedido}. Ofereça a opção de repetir o pedido com 1 clique.
3. Se o cliente pedir o cardápio ou um item específico, use as informações reais do cardápio abaixo:
CARDÁPIO DISPONÍVEL:
${cardapioFormatado}

4. Calcule sempre os adicionais e a taxa de entrega (padrão R$ ${restaurante?.taxa_entrega_padrao || 5.00}).
5. Quando o cliente confirmar os itens, endereço e forma de pagamento, finalize a venda fornecendo o resumo claro do pedido.
6. Nunca invente produtos que não estão no cardápio acima.
`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...historicoConversa,
    { role: 'user', content: mensagemTexto }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 400,
    });

    const respostaTexto = completion.choices[0]?.message?.content || 'Como posso te ajudar com o cardápio hoje?';

    return {
      respostaTexto,
      pedidoCriado: null,
    };
  } catch (error) {
    console.error('[OpenAI Agent Error]:', error);
    return {
      respostaTexto: 'Tive um pequeno solavanco na conexão, mas já estou de volta! Pode me repetir seu pedido?',
      pedidoCriado: null,
    };
  }
}
