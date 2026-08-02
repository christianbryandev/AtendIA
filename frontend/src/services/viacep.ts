export interface EnderecoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/**
 * Conveniência, não requisito: se o ViaCEP estiver fora do ar ou o CEP
 * não existir, devolve null e o lojista digita o endereço à mão. O
 * cadastro nunca trava por causa disto.
 */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const digitos = (cep || '').replace(/\D/g, '');
  if (digitos.length !== 8) return null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
    if (!resposta.ok) return null;

    const dados = await resposta.json();
    if (dados.erro) return null;

    return {
      logradouro: dados.logradouro || '',
      bairro: dados.bairro || '',
      cidade: dados.localidade || '',
      uf: dados.uf || '',
    };
  } catch {
    return null;
  }
}
