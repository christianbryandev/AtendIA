import { describe, it, expect } from 'vitest';
import { calcularJanela } from './janela.js';

const AGORA = new Date('2026-08-03T12:00:00.000Z');

describe('calcularJanela', () => {
  it('considera fechada quando o cliente nunca escreveu', () => {
    const r = calcularJanela(null, AGORA);
    expect(r.aberta).toBe(false);
    expect(r.minutosRestantes).toBe(0);
    expect(r.expiraEm).toBeNull();
  });

  it('considera aberta logo apos a mensagem do cliente', () => {
    const r = calcularJanela('2026-08-03T11:59:00.000Z', AGORA);
    expect(r.aberta).toBe(true);
    expect(r.minutosRestantes).toBe(24 * 60 - 1);
  });

  it('continua aberta faltando um minuto', () => {
    const r = calcularJanela('2026-08-02T12:01:00.000Z', AGORA);
    expect(r.aberta).toBe(true);
    expect(r.minutosRestantes).toBe(1);
  });

  // O limite e exatamente 24h: no instante em que completa, fecha.
  it('fecha exatamente em 24 horas', () => {
    const r = calcularJanela('2026-08-02T12:00:00.000Z', AGORA);
    expect(r.aberta).toBe(false);
    expect(r.minutosRestantes).toBe(0);
  });

  it('fica fechada muito depois', () => {
    const r = calcularJanela('2026-07-20T12:00:00.000Z', AGORA);
    expect(r.aberta).toBe(false);
  });

  it('informa quando a janela expira', () => {
    const r = calcularJanela('2026-08-03T09:00:00.000Z', AGORA);
    expect(r.expiraEm?.toISOString()).toBe('2026-08-04T09:00:00.000Z');
  });

  // Data invalida vinda do banco nao pode liberar envio por acidente.
  it('trata data invalida como fechada', () => {
    const r = calcularJanela('nao e uma data', AGORA);
    expect(r.aberta).toBe(false);
  });
});
