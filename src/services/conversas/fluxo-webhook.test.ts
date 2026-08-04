import { describe, it, expect } from 'vitest';
import { deveDevolverControle, decidirAtendimento, montarHistoricoParaIA } from './fluxo-webhook.js';

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

describe('montarHistoricoParaIA', () => {
  // Sem essa remocao, a IA recebe a mensagem atual do cliente duas vezes
  // seguidas no historico (uma vinda do banco, outra como mensagemTexto).
  it('remove a mensagem atual do historico pelo id', () => {
    const historico = [
      { id: '1', autor: 'cliente', texto: 'oi', transcricao: null },
      { id: '2', autor: 'cliente', texto: 'tudo bem?', transcricao: null },
    ];
    expect(montarHistoricoParaIA(historico, '2')).toEqual([
      { role: 'user', content: 'oi' },
    ]);
  });

  it('mapeia autor cliente para role user e os demais para role assistant', () => {
    const historico = [
      { id: '1', autor: 'cliente', texto: 'oi', transcricao: null },
      { id: '2', autor: 'ia', texto: 'ola, como posso ajudar?', transcricao: null },
      { id: '3', autor: 'lojista', texto: 'ja te atendo', transcricao: null },
    ];
    expect(montarHistoricoParaIA(historico, 'nenhum')).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'ola, como posso ajudar?' },
      { role: 'assistant', content: 'ja te atendo' },
    ]);
  });

  it('da precedencia a transcricao sobre o texto quando ambos existem', () => {
    const historico = [
      { id: '1', autor: 'cliente', texto: 'texto original', transcricao: 'transcricao do audio' },
    ];
    expect(montarHistoricoParaIA(historico, 'nenhum')).toEqual([
      { role: 'user', content: 'transcricao do audio' },
    ]);
  });

  it('descarta entradas sem texto e sem transcricao', () => {
    const historico = [
      { id: '1', autor: 'cliente', texto: null, transcricao: null },
      { id: '2', autor: 'cliente', texto: 'oi', transcricao: null },
    ];
    expect(montarHistoricoParaIA(historico, 'nenhum')).toEqual([
      { role: 'user', content: 'oi' },
    ]);
  });

  it('devolve lista vazia para historico vazio', () => {
    expect(montarHistoricoParaIA([], 'nenhum')).toEqual([]);
  });
});
