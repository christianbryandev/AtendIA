import { describe, it, expect } from 'vitest';
import { statusIntegracoes } from './status-integracoes.js';

const ENV_TUDO_CONFIGURADO = {
  OPENAI_API_KEY: 'sk-openai-super-secreta-nao-pode-vazar',
  GROQ_API_KEY: 'gsk-groq-super-secreta-nao-pode-vazar',
  META_WHATSAPP_TOKEN: 'EAAG-token-meta-super-secreto-nao-pode-vazar',
  META_APP_SECRET: 'app-secret-super-secreto-nao-pode-vazar',
  RESEND_API_KEY: 're_super_secreta_nao_pode_vazar',
  STRIPE_SECRET_KEY: 'sk_live_super_secreta_nao_pode_vazar',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-super-secreta-nao-pode-vazar',
};

describe('statusIntegracoes', () => {
  it('devolve true para cada integracao configurada', () => {
    expect(statusIntegracoes(ENV_TUDO_CONFIGURADO)).toEqual({
      openai: true,
      groq: true,
      metaToken: true,
      metaAppSecret: true,
      resend: true,
      stripe: true,
      supabase: true,
    });
  });

  it('devolve false para integracoes sem chave configurada', () => {
    const resultado = statusIntegracoes({
      ...ENV_TUDO_CONFIGURADO,
      OPENAI_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      RESEND_API_KEY: undefined,
      STRIPE_SECRET_KEY: undefined,
    });

    expect(resultado.openai).toBe(false);
    expect(resultado.groq).toBe(false);
    expect(resultado.resend).toBe(false);
    expect(resultado.stripe).toBe(false);
    expect(resultado.metaToken).toBe(true);
    expect(resultado.supabase).toBe(true);
  });

  it('supabase fica false se faltar qualquer uma das duas variaveis', () => {
    expect(statusIntegracoes({ ...ENV_TUDO_CONFIGURADO, SUPABASE_SERVICE_ROLE_KEY: undefined }).supabase).toBe(false);
    expect(statusIntegracoes({ ...ENV_TUDO_CONFIGURADO, SUPABASE_URL: undefined }).supabase).toBe(false);
  });

  // O que importa de verdade: nenhum fragmento de chave real pode aparecer
  // na resposta, só os nomes fixos dos campos e true/false. Isto prova a
  // propriedade "só booleanos" na pratica, não só na leitura do código.
  it('nao vaza nenhum valor de chave na resposta, so booleanos', () => {
    const resultado = statusIntegracoes(ENV_TUDO_CONFIGURADO);
    const serializado = JSON.stringify(resultado);

    for (const valorSecreto of Object.values(ENV_TUDO_CONFIGURADO)) {
      expect(serializado).not.toContain(valorSecreto);
    }

    for (const valor of Object.values(resultado)) {
      expect(typeof valor).toBe('boolean');
    }
  });
});
