import { env } from '../../config/env.js';

interface SendTextMessageParams {
  toPhoneNumber: string;
  text: string;
  phoneNumberId?: string;
  token?: string;
}

/**
 * Envia uma mensagem de texto simples pelo WhatsApp Cloud API da Meta.
 */
export async function sendWhatsAppTextMessage({ toPhoneNumber, text, phoneNumberId, token }: SendTextMessageParams) {
  const activePhoneNumberId = phoneNumberId || env.META_PHONE_NUMBER_ID;
  const activeToken = token || env.META_WHATSAPP_TOKEN;

  if (!activePhoneNumberId || !activeToken) {
    console.log(`[Meta WhatsApp Mock] Para: ${toPhoneNumber} | Mensagem: "${text}"`);
    return { success: true, mock: true };
  }

  const url = `https://graph.facebook.com/v20.0/${activePhoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${activeToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhoneNumber,
      type: 'text',
      text: { body: text },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('[Meta WhatsApp API Error]:', data);
    throw new Error(`Erro ao enviar mensagem Meta WhatsApp: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Envia uma nota de voz (.ogg / opus) no WhatsApp do cliente.
 */
export async function sendWhatsAppVoiceMessage(toPhoneNumber: string, mediaIdOrUrl: string, phoneNumberId?: string, token?: string) {
  const activePhoneNumberId = phoneNumberId || env.META_PHONE_NUMBER_ID;
  const activeToken = token || env.META_WHATSAPP_TOKEN;

  if (!activePhoneNumberId || !activeToken) {
    console.log(`[Meta WhatsApp Voice Mock] Para: ${toPhoneNumber} | Media: ${mediaIdOrUrl}`);
    return { success: true, mock: true };
  }

  const url = `https://graph.facebook.com/v20.0/${activePhoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${activeToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhoneNumber,
      type: 'audio',
      audio: { id: mediaIdOrUrl },
    }),
  });

  return await response.json();
}

/**
 * Faz o download de um arquivo de mídia (ex: áudio) recebido do WhatsApp.
 * Processo de 2 passos: 1. Busca a URL da mídia. 2. Faz o download usando o token de autorização.
 */
export async function downloadWhatsAppMedia(mediaId: string, token: string): Promise<Buffer> {
  // 1. Obter a URL da mídia
  const urlRequest = `https://graph.facebook.com/v20.0/${mediaId}`;
  const responseUrl = await fetch(urlRequest, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!responseUrl.ok) {
    throw new Error(`Falha ao obter URL da mídia ${mediaId}`);
  }

  const mediaData = await responseUrl.json();
  const mediaUrl = mediaData.url;

  if (!mediaUrl) {
    throw new Error(`URL não encontrada na resposta da mídia ${mediaId}`);
  }

  // 2. Fazer o download real do arquivo
  const responseFile = await fetch(mediaUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!responseFile.ok) {
    throw new Error(`Falha ao baixar o arquivo da mídia ${mediaId}`);
  }

  const arrayBuffer = await responseFile.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
