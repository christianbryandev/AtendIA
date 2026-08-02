/**
 * Validação de CNPJ pelos dígitos verificadores, não só pelo formato.
 * Formato sozinho deixa passar 11.111.111/1111-11, que nunca existirá.
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
    // Os pesos vão de 5 (ou 6) até 2 e reiniciam em 9.
    if (peso < 2) peso = 9;
  }

  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCnpj(cnpj: string): boolean {
  const digitos = normalizarCnpj(cnpj);

  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const primeiro = calcularDigito(digitos.slice(0, 12), 5);
  if (primeiro !== Number(digitos[12])) return false;

  const segundo = calcularDigito(digitos.slice(0, 13), 6);
  return segundo === Number(digitos[13]);
}
