import axios from 'axios';
import { supabase } from '../../config/supabase.js';
import { env } from '../../config/env.js';

const IFOOD_API_BASE_URL = 'https://merchant-api.ifood.com.br';

export async function importarCardapioiFood(restauranteId: string) {
  try {
    // 1. Validar Credenciais Globais
    const clientId = env.IFOOD_CLIENT_ID;
    const clientSecret = env.IFOOD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Credenciais da aplicação centralizada do iFood não configuradas no servidor.');
    }

    // 2. Buscar o Merchant ID do Restaurante no Banco
    const { data: restaurante, error: dbError } = await supabase
      .from('restaurantes')
      .select('ifood_merchant_id')
      .eq('id', restauranteId)
      .single();

    if (dbError || !restaurante?.ifood_merchant_id) {
      throw new Error('Merchant ID do iFood não configurado para este restaurante.');
    }

    const merchantId = restaurante.ifood_merchant_id;

    // --- PASSO A: Autenticação ---
    const authParams = new URLSearchParams({
      grantType: 'client_credentials',
      clientId: clientId,
      clientSecret: clientSecret
    });

    const authResponse = await axios.post(`${IFOOD_API_BASE_URL}/authentication/v1.0/oauth/token`, authParams.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const accessToken = authResponse.data.accessToken;

    if (!accessToken) {
      throw new Error('Falha ao obter accessToken do iFood.');
    }

    const apiHeaders = {
      'Authorization': `Bearer ${accessToken}`
    };

    // --- PASSO B: Buscar Catálogo ---
    const catalogsResponse = await axios.get(`${IFOOD_API_BASE_URL}/catalog/v1.0/merchants/${merchantId}/catalogs`, {
      headers: apiHeaders
    });

    const catalogs = catalogsResponse.data;
    if (!catalogs || catalogs.length === 0) {
      throw new Error('Nenhum catálogo encontrado para este Merchant ID.');
    }

    // Priorizar o catálogo ativo/disponível, caso contrário pega o primeiro
    const activeCatalog = catalogs.find((c: any) => c.status === 'AVAILABLE') || catalogs[0];
    const catalogId = activeCatalog.catalogId;

    // --- PASSO C: Puxar Detalhes do Cardápio ---
    const catalogDetailsResponse = await axios.get(`${IFOOD_API_BASE_URL}/catalog/v1.0/merchants/${merchantId}/catalogs/${catalogId}`, {
      headers: apiHeaders
    });

    const catalogData = catalogDetailsResponse.data;

    // --- PASSO D: Tratamento de Dados (Parse JSON para String) ---
    let cardapioFormatado = 'CARDÁPIO iFOOD ATUALIZADO:\n\n';

    // Suporte genérico para arrays de categorias (dependendo de como a API v1.0 serializa a árvore)
    const categorias = catalogData.categories || catalogData; 

    if (Array.isArray(categorias)) {
      categorias.forEach((categoria: any) => {
        cardapioFormatado += `- Categoria: ${categoria.name || 'Geral'}\n`;
        
        if (Array.isArray(categoria.items)) {
          categoria.items.forEach((item: any) => {
            const preco = item.price?.value || 0;
            const nome = item.name || 'Produto sem nome';
            const descricao = item.description ? ` (${item.description})` : '';
            cardapioFormatado += `  * ${nome}${descricao} - Preço: R$ ${preco.toFixed(2)}\n`;
          });
        }
        cardapioFormatado += '\n';
      });
    } else {
      cardapioFormatado += 'Formato de cardápio não reconhecido ou vazio.\n';
    }

    // Adiciona uma instrução extra no final
    cardapioFormatado += 'REGRA DA IA: Use EXATAMENTE os nomes e preços deste cardápio para responder ao cliente.';

    // --- PASSO E: Salvar no Banco ---
    const { error: updateError } = await supabase
      .from('restaurantes')
      .update({ instrucoes_personalizadas: cardapioFormatado })
      .eq('id', restauranteId);

    if (updateError) {
      throw new Error(`Erro ao salvar no banco de dados: ${updateError.message}`);
    }

    return { 
      success: true, 
      message: 'Cardápio sincronizado com sucesso!',
      preview: cardapioFormatado
    };

  } catch (error: any) {
    console.error('[iFood Sync Error]:', error.response?.data || error.message);
    throw new Error(`Falha na sincronização com iFood: ${error.message}`);
  }
}
