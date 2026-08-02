import { z } from 'zod';
import { validarCnpj, normalizarCnpj } from '../../utils/cnpj.js';

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

const schema = z.object({
  nome: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email({ message: 'E-mail inválido.' }),
  senha: z.string().min(8, { message: 'A senha precisa ter ao menos 8 caracteres.' }),
  restauranteNome: z.string().trim().min(2),
  cnpj: z.string().refine(validarCnpj, { message: 'CNPJ inválido.' }),
  cep: z.string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, { message: 'CEP inválido.' }),
  logradouro: z.string().trim().min(2),
  numero: z.string().trim().min(1),
  complemento: z.string().trim().optional().default(''),
  bairro: z.string().trim().min(2),
  cidade: z.string().trim().min(2),
  uf: z.string().trim().toUpperCase()
    .refine((v) => (UFS as readonly string[]).includes(v), { message: 'UF inválida.' }),
});

export type DadosCadastro = z.infer<typeof schema>;

export type ResultadoValidacao =
  | { ok: true; dados: DadosCadastro }
  | { ok: false; erro: string; status: number };

export function validarPayloadCadastro(body: unknown): ResultadoValidacao {
  const r = schema.safeParse(body);

  if (!r.success) {
    // A primeira mensagem basta: o formulário do front valida campo a
    // campo, então isto é a última linha de defesa, não a experiência.
    const primeiro = r.error.issues[0];
    const temMensagemPropria = primeiro?.message && !primeiro.message.startsWith('String must');

    return {
      ok: false,
      erro: temMensagemPropria ? primeiro.message : 'Dados de cadastro incompletos ou inválidos.',
      status: 400,
    };
  }

  return { ok: true, dados: { ...r.data, cnpj: normalizarCnpj(r.data.cnpj) } };
}
