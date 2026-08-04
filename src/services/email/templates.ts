/** Corpo de um e-mail transacional: assunto e HTML já prontos para enviar. */
export interface TemplateEmail {
  subject: string;
  html: string;
}

/**
 * E-mail de "esqueci minha senha", com o link de redefinição.
 *
 * O link carrega o token em texto puro (é assim que ele chega ao
 * lojista) — só o hash dele fica no banco. Validade de 1 hora, o
 * mesmo prazo gravado em tokens_recuperacao.expira_em.
 */
export function templateRecuperacaoSenha(link: string): TemplateEmail {
  return {
    subject: 'Redefinição de senha — AtendIA',
    html: `
      <p>Recebemos um pedido para redefinir a senha da sua conta AtendIA.</p>
      <p><a href="${link}">Clique aqui para criar uma nova senha</a></p>
      <p>Este link é válido por 1 hora e só pode ser usado uma vez.</p>
      <p>Se você não pediu essa redefinição, pode ignorar este e-mail — sua senha continua a mesma.</p>
    `.trim(),
  };
}

/**
 * E-mail avisando que a cota de créditos de IA acabou e o atendimento
 * automático no WhatsApp está pausado até a virada do ciclo ou a
 * compra de créditos avulsos.
 */
export function templateCotaEsgotada(nomeRestaurante: string): TemplateEmail {
  return {
    subject: 'Sua cota de atendimento por IA acabou — AtendIA',
    html: `
      <p>Olá, ${nomeRestaurante}!</p>
      <p>Seus créditos de atendimento por IA no WhatsApp acabaram. Enquanto isso, o atendimento automático fica pausado e seus clientes recebem uma mensagem informando para falar direto com a loja.</p>
      <p>Para voltar a atender automaticamente, compre um pacote avulso de créditos ou aguarde a renovação do seu ciclo de cobrança.</p>
    `.trim(),
  };
}
