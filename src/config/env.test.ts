import { describe, expect, it } from 'vitest';
import { ehOrigemSupabaseValida, normalizarAppUrl } from './env.js';

// Testa só a regra de validação de SUPABASE_URL, sem importar/parsear o
// process.env inteiro (o que env.ts faz no momento do import).
describe('ehOrigemSupabaseValida', () => {
  it('aceita a origem pura', () => {
    expect(ehOrigemSupabaseValida('https://abcdefg.supabase.co')).toBe(true);
  });

  it('aceita a origem com barra final', () => {
    expect(ehOrigemSupabaseValida('https://abcdefg.supabase.co/')).toBe(true);
  });

  it('rejeita URL com path além da barra final', () => {
    expect(ehOrigemSupabaseValida('https://abcdefg.supabase.co/rest/v1/')).toBe(false);
  });

  it('rejeita URL com query string', () => {
    expect(ehOrigemSupabaseValida('https://abcdefg.supabase.co?apikey=abc')).toBe(false);
  });

  it('rejeita URL com fragmento', () => {
    expect(ehOrigemSupabaseValida('https://abcdefg.supabase.co#secao')).toBe(false);
  });

  it('rejeita string que não é uma URL válida', () => {
    expect(ehOrigemSupabaseValida('nao-e-uma-url')).toBe(false);
  });
});

// Testa a normalização de APP_URL isoladamente, sem disparar o parse do
// process.env inteiro. Ver o comentário no schema (campo APP_URL, em
// env.ts) para o bug real que essa normalização evita.
describe('normalizarAppUrl', () => {
  it('produz a mesma origem com ou sem barra final', () => {
    expect(normalizarAppUrl('https://atendiarp.com.br/')).toBe(
      normalizarAppUrl('https://atendiarp.com.br'),
    );
  });

  it('reduz uma URL com caminho à sua origem', () => {
    expect(normalizarAppUrl('https://atendiarp.com.br/app')).toBe('https://atendiarp.com.br');
  });

  it('preserva a porta', () => {
    expect(normalizarAppUrl('http://localhost:5173/')).toBe('http://localhost:5173');
  });
});
