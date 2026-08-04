import Groq from 'groq-sdk';
import { env } from '../../config/env.js';

let instancia: Groq | null = null;

/** Único ponto do sistema que conhece a chave da Groq. */
function getGroq(): Groq {
  if (!env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY não configurada. Transcrição de áudio indisponível.');
  }

  if (!instancia) {
    instancia = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  return instancia;
}

/**
 * Transcreve um arquivo de áudio (Buffer/Stream) para texto usando o modelo Whisper v3 da Groq.
 */
export async function transcribeAudioWithGroq(audioBuffer: Buffer, fileName = 'audio.ogg'): Promise<string> {
  const groq = getGroq();

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
