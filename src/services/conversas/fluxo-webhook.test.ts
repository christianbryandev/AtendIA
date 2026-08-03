import { describe, it, expect } from 'vitest';
import { deveDevolverControle, decidirAtendimento } from './fluxo-webhook.js';

const AGORA = new Date('2026-08-03T12:00:00.000Z');

describe('deveDevolverControle', () => {
  it('nao devolve quando ninguem assumiu', () => {
    expect(deveDevolverControle(null, '2026-08-03T10:00:00.000Z', AGORA)).toBe(false);
  });

  it('nao devolve com conversa ativa ha pouco', () => {
    expect(deveDevolverControle('2026-08-03T11:00:00.000Z', '2026-08-03T11:50:00.000Z', AGORA)).toBe(false);
  });

  it('devolve apos 30 minutos sem mensagem nova', () => {
    expect(deveDevolverControle('2026-08-03T10:00:00.000Z', '2026-08-03T11:20:00.000Z', AGORA)).toBe(true);
  });

  // O limite e exatamente 30 minutos.
  it('devolve exatamente em 30 minutos', () => {
    expect(deveDevolverControle('2026-08-03T10:00:00.000Z', '2026-08-03T11:30:00.000Z', AGORA)).toBe(true);
  });

  // Sem mensagem nenhuma na conversa, o marco e o momento em que o
  // lojista assumiu — senao o controle ficaria preso para sempre.
  it('usa o momento em que assumiu quando nao ha mensagem posterior', () => {
    expect(deveDevolverControle('2026-08-03T11:00:00.000Z', null, AGORA)).toBe(true);
    expect(deveDevolverControle('2026-08-03T11:45:00.000Z', null, AGORA)).toBe(false);
  });
});

describe('decidirAtendimento', () => {
  const base = {
    id: 'x', restauranteId: 'r', telefoneCliente: '55119',
    ultimaMensagemClienteEm: null, ultimaMensagemEm: '2026-08-03T11:50:00.000Z',
    sobControleHumano: false, controleAssumidoEm: null,
  };

  it('IA responde quando ninguem assumiu', () => {
    expect(decidirAtendimento(base as any, AGORA)).toEqual({ iaResponde: true, devolverControle: false });
  });

  it('IA responde em conversa que ainda nao existe', () => {
    expect(decidirAtendimento(null, AGORA)).toEqual({ iaResponde: true, devolverControle: false });
  });

  // O teste central: com o lojista no comando, a IA nao pode responder
  // nem consumir credito.
  it('IA NAO responde com o lojista no comando ha pouco', () => {
    const c = { ...base, sobControleHumano: true, controleAssumidoEm: '2026-08-03T11:40:00.000Z' };
    expect(decidirAtendimento(c as any, AGORA)).toEqual({ iaResponde: false, devolverControle: false });
  });

  it('IA volta e pede devolucao do controle apos a ociosidade', () => {
    const c = { ...base, sobControleHumano: true, controleAssumidoEm: '2026-08-03T10:00:00.000Z', ultimaMensagemEm: '2026-08-03T11:00:00.000Z' };
    expect(decidirAtendimento(c as any, AGORA)).toEqual({ iaResponde: true, devolverControle: true });
  });
});
