/**
 * Valida se um preço é um número positivo com no máximo duas casas decimais.
 *
 * A comparação direta com `Math.round(preco * 100) === preco * 100` não é confiável
 * por causa de erros de ponto flutuante em binário IEEE 754. Por exemplo:
 * - 19.99 * 100 = 1998.9999999999998 (não 1999), então a comparação falha
 * - 10.05 * 100 = 1004.9999999999999 (não 1005), então a comparação falha
 *
 * Essa é uma das razões de falsos negativos: o dono tenta cadastrar R$ 19,99
 * (um preço padrão!) e recebe erro "Preço inválido" sem motivo legítimo.
 *
 * A solução é comparar com uma tolerância pequena (epsilon), permitindo uma
 * margem para erro de arredondamento enquanto ainda rejeitamos valores com
 * três ou mais casas decimais.
 */
function precoValido(preco: unknown): preco is number {
  if (typeof preco !== 'number' || !Number.isFinite(preco) || preco <= 0) {
    return false;
  }

  // Converte para centavos e verifica se está próximo a um inteiro.
  // Usa epsilon de 1e-9 para absorver erro de ponto flutuante.
  const centavos = preco * 100;
  const arredondado = Math.round(centavos);
  const diferenca = Math.abs(centavos - arredondado);

  return diferenca < 1e-9;
}

export { precoValido };
