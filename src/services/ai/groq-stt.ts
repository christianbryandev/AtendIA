import Groq from 'groq-sdk';
import { env } from '../../config/env.js';

const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY }) : null;

/**
 * Transcreve um arquivo de áudio (Buffer/Stream) para texto usando o modelo Whisper v3 da Groq.
 */
export async function transcribeAudioWithGroq(audioBuffer: Buffer, fileName = 'audio.ogg'): Promise<string> {
  if (!groq) {
    console.warn('[Groq STT] GROQ_API_KEY não configurada. Usando transcrição simulada.');
    return 'Gostaria de pedir um X-Bacon com fritas e uma Coca-Cola 350ml.';
  }

  try {
    // Converter Buffer em objeto File sintético para a API do Groq usando Groq.toFile
    const file = await Groq.toFile(audioBuffer, fileName, { type: 'audio/ogg' });

    const response = await groq.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3',
      prompt: 'Transcrição de pedido de delivery de restaurante em português do Brasil.',
      temperature: 0.0,
      language: 'pt',
    });

    return response.text;
  } catch (error) {
    console.error('[Groq STT Error]:', error);
    throw new Error('Falha ao transcrever o áudio com Groq Whisper.');
  }
}
