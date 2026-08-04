import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { listarCardapio } from '../cardapio/cardapio-repo.js';
import { montarTextoDoCardapio } from '../cardapio/cardapio-para-ia.js';

let instancia: OpenAI | null = null;

/** Único ponto do sistema que conhece a chave da OpenAI. */
function getOpenAI(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada. Atendimento por IA indisponível.');
  }

  if (!instancia) {
    instancia = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  return instancia;
}

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

  const openai = getOpenAI();

  // 1. Busca dados do Restaurante & Cardápio no banco (usando supabaseAdmin pois é contexto de webhook)
  const { data: restaurante } = await supabaseAdmin
    .from('restaurantes')
    .select('*')
    .eq('id', restauranteId)
    .single();

  if (!restaurante) {
    throw new Error('Restaurante não encontrado na IA');
  }

  const categorias = await listarCardapio(restauranteId);
  const cardapioFormatado = montarTextoDoCardapio(categorias);

  // 2. Busca histórico do cliente no CRM
  const { data: clienteCrm } = await supabaseAdmin
    .from('clientes_crm')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('telefone_whatsapp', telefoneCliente)
    .single();

  const historicoUltimoPedido = clienteCrm?.ultimo_pedido_json 
    ? JSON.stringify(clienteCrm.ultimo_pedido_json)
    : 'Nenhum pedido anterior.';

  const systemPrompt = `
Você é o atendente de vendas de IA humanizado do restaurante "${restaurante.nome}".
Seu tom de voz é: ${restaurante.tom_voz_ia || 'Amigável, rápido e descontraído'}.
Instruções personalizadas do restaurante: ${restaurante.instrucoes_personalizadas || 'Nenhuma instrução adicional.'}

REGRAS DE ATENDIMENTO:
1. Atenda o cliente pelo nome se disponível (${clienteCrm?.nome || 'amigo(a)'}).
2. Se o cliente for recorrente, consulte o histórico: ${historicoUltimoPedido}.
3. Você deve usar as informações reais do cardápio abaixo. JAMAIS INVENTE PREÇOS OU PRODUTOS.
CARDÁPIO DISPONÍVEL:
${cardapioFormatado}

4. Quando o cliente confirmar exatamente o que quer, o endereço de entrega e a forma de pagamento (PIX_ONLINE, DINHEIRO, CARTAO_ENTREGA), você DEVE chamar a ferramenta 'finalizar_pedido'.
5. Na ferramenta 'finalizar_pedido', forneça APENAS a lista de produtos (pelo ID exato listado acima) e quantidades, e o endereço. O sistema calculará o valor real.
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
      temperature: 0.2, // Baixa temperatura para não errar IDs
      max_tokens: 400,
      tools: [
        {
          type: 'function',
          function: {
            name: 'finalizar_pedido',
            description: 'Acione esta função apenas quando o cliente confirmar todos os itens, endereço e forma de pagamento.',
            parameters: {
              type: 'object',
              properties: {
                itens: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      produto_id: { type: 'string', description: 'O ID UUID exato do produto no cardápio' },
                      quantidade: { type: 'number', description: 'A quantidade solicitada deste produto' }
                    },
                    required: ['produto_id', 'quantidade']
                  }
                },
                endereco_entrega: { type: 'string', description: 'O endereço completo de entrega confirmado pelo cliente' },
                forma_pagamento: { type: 'string', enum: ['PIX_ONLINE', 'DINHEIRO', 'CARTAO_ENTREGA'] },
                observacoes: { type: 'string', description: 'Observações do pedido ex: sem cebola, troco para 50' }
              },
              required: ['itens', 'endereco_entrega', 'forma_pagamento']
            }
          }
        }
      ],
      tool_choice: 'auto'
    });

    const responseMessage = completion.choices[0]?.message;

    // Se a IA decidiu chamar a ferramenta de finalizar pedido
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      
      if (toolCall.function.name === 'finalizar_pedido') {
        const args = JSON.parse(toolCall.function.arguments);
        
        // VALIDAÇÃO 2: Array de itens vazio ou ausente
        if (!args.itens || !Array.isArray(args.itens) || args.itens.length === 0) {
          console.error('[AI Agent] Erro: Tentativa de criar pedido sem itens.');
          return {
            respostaTexto: 'Não consegui identificar os itens do seu pedido. Poderia repetir o que deseja pedir do cardápio?',
            pedidoCriado: null
          };
        }
        
        let valorSubtotalCentavos = 0;
        
        // 1. O Backend calcula o valor verificando os itens
        for (const item of args.itens) {
          // VALIDAÇÃO 1: Quantidade inteira e positiva
          if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) {
            console.error(`[AI Agent] Erro: Quantidade inválida fornecida pela IA: ${item.quantidade}`);
            return {
              respostaTexto: 'Percebi um erro com a quantidade dos itens. Poderia me confirmar novamente quantos de cada item você quer?',
              pedidoCriado: null
            };
          }

          // FILTRO SEGURO: restaurante_id e disponivel=true
          const { data: dbItem, error } = await supabaseAdmin
            .from('produtos_cardapio')
            .select('preco')
            .eq('id', item.produto_id)
            .eq('restaurante_id', restauranteId)
            .eq('disponivel', true)
            .single();
            
          if (error || !dbItem) {
            console.error(`[AI Agent] Tentativa de comprar item indisponível ou falso: ${item.produto_id}`);
            return {
              respostaTexto: 'Desculpe, percebi que um dos itens que você escolheu não está mais disponível no momento. Pode me confirmar seu pedido novamente focando no cardápio atual?',
              pedidoCriado: null
            };
          }
          
          // VALIDAÇÃO 4: Cálculo em centavos para precisão
          const precoCentavos = Math.round(Number(dbItem.preco) * 100);
          valorSubtotalCentavos += precoCentavos * item.quantidade;
        }

        const taxaEntregaCentavos = Math.round(Number(restaurante.taxa_entrega_padrao || 0) * 100);
        const valorTotalCentavos = valorSubtotalCentavos + taxaEntregaCentavos;

        // Convertendo de volta para formato de banco (reais) apenas na gravação
        const valorSubtotalReal = Math.round(valorSubtotalCentavos) / 100;
        const taxaEntregaReal = Math.round(taxaEntregaCentavos) / 100;
        const valorTotalReal = Math.round(valorTotalCentavos) / 100;

        // 2. Grava o Pedido
        const { data: novoPedido, error: erroPedido } = await supabaseAdmin
          .from('pedidos')
          .insert({
            restaurante_id: restauranteId,
            cliente_id: clienteCrm?.id || null, // Se cliente não existir no CRM ainda
            status: 'NOVO',
            valor_subtotal: valorSubtotalReal,
            valor_taxa_entrega: taxaEntregaReal,
            valor_desconto: 0,
            valor_total: valorTotalReal,
            endereco_entrega: args.endereco_entrega,
            observacoes: args.observacoes || '',
            forma_pagamento: args.forma_pagamento
          })
          .select('*')
          .single();

        if (erroPedido || !novoPedido) {
          console.error('[AI Agent] Erro ao salvar pedido:', erroPedido);
          throw new Error('Erro no banco de dados ao salvar o pedido.');
        }
        
        // Retorna a mensagem de sucesso humanizada gerada aqui
        return {
          respostaTexto: `Tudo certo! 🎉 Seu pedido foi gerado com sucesso.\nSubtotal: R$ ${valorSubtotalReal.toFixed(2)}\nTaxa de Entrega: R$ ${taxaEntregaReal.toFixed(2)}\n*Total: R$ ${valorTotalReal.toFixed(2)}*\n\nJá estamos preparando tudo para enviar para ${args.endereco_entrega}.`,
          pedidoCriado: novoPedido
        };
      }
    }

    // Se não chamou a tool, apenas retorna a resposta normal em texto
    return {
      respostaTexto: responseMessage?.content || 'Como posso te ajudar?',
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
