import { describe, it, expect, vi } from 'vitest';

// Sem GROQ_API_KEY configurada: a função deve lançar, nunca devolver uma
// transcrição inventada. Antes desta correção, o retorno era um texto
// hardcoded que entrava no histórico da IA como se fosse fala real do
// cliente — podendo até gerar um pedido de verdade.
vi.mock('../../config/env.js', () => ({
  env: { GROQ_API_KEY: undefined },
}));

import { transcribeAudioWithGroq } from './groq-stt.js';

describe('transcribeAudioWithGroq', () => {
  it('lanca erro quando GROQ_API_KEY nao esta configurada, em vez de devolver transcricao simulada', async () => {
    await expect(transcribeAudioWithGroq(Buffer.from('audio'), 'audio.ogg')).rejects.toThrow(
      /GROQ_API_KEY não configurada/
    );
  });
});
