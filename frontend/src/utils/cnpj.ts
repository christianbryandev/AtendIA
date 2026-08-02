/**
 * Mesmo algoritmo do backend (src/utils/cnpj.ts). Duplicado de
 * propósito: o backend é ESM em Node e o frontend é bundle de
 * navegador, e compartilhar um pacote entre os dois custaria mais
 * do que estas trinta linhas. O backend continua sendo a autoridade —
 * isto aqui existe só para dar erro antes de gastar uma requisição.
 */

export function normalizarCnpj(cnpj: string): string {
  return (cnpj || '').replace(/\D/g, '');
}

function calcularDigito(base: string, pesoInicial: number): number {
  let peso = pesoInicial;
  let soma = 0;

  for (const caractere of base) {
    soma += Number(caractere) * peso;
    peso -= 1;
    if (peso < 2) peso = 9;
  }

  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCnpj(cnpj: string): boolean {
  const digitos = normalizarCnpj(cnpj);

  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  if (calcularDigito(digitos.slice(0, 12), 5) !== Number(digitos[12])) return false;
  return calcularDigito(digitos.slice(0, 13), 6) === Number(digitos[13]);
}

export function formatarCnpj(cnpj: string): string {
  const d = normalizarCnpj(cnpj).slice(0, 14);

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
