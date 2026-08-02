import { z } from 'zod';
import { validarCnpj, normalizarCnpj } from '../../utils/cnpj.js';

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

// Toda mensagem de campo é declarada explicitamente em português,
// inclusive as de tipo/obrigatoriedade (required_error / invalid_type_error).
// Isso evita depender do texto padrão do zod (em inglês) em qualquer
// caminho de validação: campo ausente, tipo errado, etc.
const erroCampoObrigatorio = { required_error: 'Campo obrigatório.', invalid_type_error: 'Campo obrigatório.' };

const schema = z.object({
  nome: z.string(erroCampoObrigatorio).trim().min(2, { message: 'Nome precisa ter ao menos 2 caracteres.' }),
  email: z.string(erroCampoObrigatorio).trim().toLowerCase().email({ message: 'E-mail inválido.' }),
  senha: z.string(erroCampoObrigatorio).min(8, { message: 'A senha precisa ter ao menos 8 caracteres.' }),
  restauranteNome: z.string(erroCampoObrigatorio).trim().min(2, { message: 'Nome do restaurante precisa ter ao menos 2 caracteres.' }),
  cnpj: z.string(erroCampoObrigatorio).refine(validarCnpj, { message: 'CNPJ inválido.' }),
  cep: z.string(erroCampoObrigatorio)
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, { message: 'CEP inválido.' }),
  logradouro: z.string(erroCampoObrigatorio).trim().min(2, { message: 'Logradouro precisa ter ao menos 2 caracteres.' }),
  numero: z.string(erroCampoObrigatorio).trim().min(1, { message: 'Número é obrigatório.' }),
  complemento: z.string(erroCampoObrigatorio).trim().optional().default(''),
  bairro: z.string(erroCampoObrigatorio).trim().min(2, { message: 'Bairro precisa ter ao menos 2 caracteres.' }),
  cidade: z.string(erroCampoObrigatorio).trim().min(2, { message: 'Cidade precisa ter ao menos 2 caracteres.' }),
  uf: z.string(erroCampoObrigatorio).trim().toUpperCase()
    .refine((v) => (UFS as readonly string[]).includes(v), { message: 'UF inválida.' }),
}, erroCampoObrigatorio);

export type DadosCadastro = z.infer<typeof schema>;

export type ResultadoValidacao =
  | { ok: true; dados: DadosCadastro }
  | { ok: false; erro: string; status: number };

export function validarPayloadCadastro(body: unknown): ResultadoValidacao {
  const r = schema.safeParse(body);

  if (!r.success) {
    // A primeira mensagem basta: o formulário do front valida campo a
    // campo, então isto é a última linha de defesa, não a experiência.
    //
    // Toda mensagem do schema acima é declarada explicitamente em
    // português (inclusive required_error/invalid_type_error de cada
    // campo). Por isso usamos a mensagem do issue diretamente, em vez de
    // tentar filtrar textos padrão do zod por prefixo — esse filtro era
    // frágil e deixava passar mensagens em inglês (ex.: "Required" para
    // campo ausente, "Expected string, received number" para tipo
    // errado). O fallback genérico só cobre o caso extremo de um issue
    // sem mensagem reconhecida.
    const primeiro = r.error.issues[0];

    return {
      ok: false,
      erro: primeiro?.message || 'Dados de cadastro incompletos ou inválidos.',
      status: 400,
    };
  }

  return { ok: true, dados: { ...r.data, cnpj: normalizarCnpj(r.data.cnpj) } };
}
