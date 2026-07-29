import OpenAI from 'openai';
import { env } from '../../config/env.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

/**
 * Converte um texto de resposta da IA em um áudio nativo (.ogg / .mp3) com voz humanizada.
 */
export async function generateVoiceAudioFromText(text: string, voice: 'alloy' | 'nova' | 'shimmer' | 'fable' = 'nova'): Promise<Buffer> {
  if (!openai) {
    console.warn('[OpenAI TTS] OPENAI_API_KEY não configurada. Retornando buffer vazio.');
    return Buffer.from('');
  }

  try {
    const mp3Response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice,
      input: text,
      response_format: 'opus', // Formato otimizado para mensagens de voz no WhatsApp
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    return buffer;
  } catch (error) {
    console.error('[OpenAI TTS Error]:', error);
    throw new Error('Falha ao gerar o áudio de voz com OpenAI TTS.');
  }
}
