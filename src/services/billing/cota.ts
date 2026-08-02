/**
 * Créditos que a cota mensal do plano concede.
 *
 * Vive num módulo próprio (e não no webhook-handler, onde nasceu) porque
 * hoje três lugares precisam do número: o webhook do Stripe, a
 * reconciliação sob demanda em status.ts e a rota de status em server.ts.
 * Importar o webhook-handler só para ler a constante arrastaria junto o
 * cliente do Stripe e o do Supabase para quem não precisa deles.
 */
export const CREDITOS_DA_COTA = 10000;
