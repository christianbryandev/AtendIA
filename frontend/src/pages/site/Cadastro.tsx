import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container';
import { API_URL } from '../../services/api';
import { validarCnpj, formatarCnpj, normalizarCnpj } from '../../utils/cnpj';
import { buscarCep, type EnderecoCep } from '../../services/viacep';

const CAMPOS_INICIAIS = {
  nome: '', email: '', senha: '', restauranteNome: '', cnpj: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
};

const CAMPOS_ENDERECO = ['logradouro', 'bairro', 'cidade', 'uf'] as const;

const rotuloClasse = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-600';
const campoClasse =
  'w-full rounded-lg border border-stone-300 bg-white p-3 text-sm text-ink-800 ' +
  'focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

function normalizarParaComparacao(valor: string): string {
  return valor.trim().toLowerCase();
}

// Um campo "diverge" quando o lojista já digitou algo nele e o ViaCEP
// trouxe um valor diferente. Campo vazio nunca diverge: só é preenchido.
function enderecoDivergeDoDigitado(endereco: EnderecoCep, atual: typeof CAMPOS_INICIAIS): boolean {
  return CAMPOS_ENDERECO.some((chave) => {
    const digitado = atual[chave];
    const doCep = endereco[chave];
    return (
      digitado.trim() !== '' &&
      doCep.trim() !== '' &&
      normalizarParaComparacao(digitado) !== normalizarParaComparacao(doCep)
    );
  });
}

// Preenche só os campos de endereço que ainda estão vazios, sem nunca
// sobrescrever o que o lojista já digitou.
function mesclarComEnderecoDoCep(atual: typeof CAMPOS_INICIAIS, endereco: EnderecoCep): typeof CAMPOS_INICIAIS {
  return {
    ...atual,
    logradouro: atual.logradouro || endereco.logradouro,
    bairro: atual.bairro || endereco.bairro,
    cidade: atual.cidade || endereco.cidade,
    uf: atual.uf || endereco.uf,
  };
}

export default function Cadastro() {
  const [campos, setCampos] = useState(CAMPOS_INICIAIS);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enderecoCepDivergente, setEnderecoCepDivergente] = useState<EnderecoCep | null>(null);
  const navigate = useNavigate();

  const cnpjRef = useRef<HTMLInputElement>(null);
  const cnpjDigitosAntesDoCursor = useRef<number | null>(null);

  const atualizar = (chave: keyof typeof CAMPOS_INICIAIS, valor: string) => {
    setCampos((atual) => ({ ...atual, [chave]: valor }));
    if (chave === 'cep') setEnderecoCepDivergente(null);
  };

  const completarPeloCep = async () => {
    const endereco = await buscarCep(campos.cep);
    if (!endereco) return;

    setEnderecoCepDivergente(enderecoDivergeDoDigitado(endereco, campos) ? endereco : null);
    setCampos((atual) => mesclarComEnderecoDoCep(atual, endereco));
  };

  const usarEnderecoDoCep = () => {
    if (!enderecoCepDivergente) return;
    const endereco = enderecoCepDivergente;
    setCampos((atual) => ({
      ...atual,
      logradouro: endereco.logradouro,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      uf: endereco.uf,
    }));
    setEnderecoCepDivergente(null);
  };

  const alterarCnpj = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const valorNovo = evento.target.value;
    const posicaoCursor = evento.target.selectionStart ?? valorNovo.length;
    cnpjDigitosAntesDoCursor.current = valorNovo.slice(0, posicaoCursor).replace(/\D/g, '').length;
    atualizar('cnpj', valorNovo);
  };

  // Depois de reformatar o CNPJ, o cursor volta para a posição equivalente
  // em número de dígitos, em vez de pular para o fim do campo.
  useLayoutEffect(() => {
    const digitosAntes = cnpjDigitosAntesDoCursor.current;
    if (digitosAntes === null || !cnpjRef.current) return;
    cnpjDigitosAntesDoCursor.current = null;

    const formatado = formatarCnpj(campos.cnpj);
    let digitosContados = 0;
    let posicao = 0;
    while (posicao < formatado.length && digitosContados < digitosAntes) {
      if (/\d/.test(formatado[posicao])) digitosContados += 1;
      posicao += 1;
    }
    cnpjRef.current.setSelectionRange(posicao, posicao);
  }, [campos.cnpj]);

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);

    // Validação local só para não gastar requisição no erro mais comum.
    // O backend valida tudo de novo.
    if (!validarCnpj(campos.cnpj)) {
      setErro('CNPJ inválido.');
      return;
    }

    if (campos.senha.length < 8) {
      setErro('A senha precisa ter ao menos 8 caracteres.');
      return;
    }

    setEnviando(true);

    try {
      const resposta = await fetch(`${API_URL}/auth/cadastro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...campos, cnpj: normalizarCnpj(campos.cnpj) }),
      });

      const dados = await resposta.json();

      if (resposta.ok && dados.success) {
        localStorage.setItem('auth_token', dados.token);
        navigate('/assinatura/pagamento');
        return;
      }

      setErro(dados.error || 'Não foi possível criar a conta.');
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Criar sua conta
        </h1>
        <p className="mt-3 text-ink-600">
          Leva dois minutos. Você revisa o pagamento no passo seguinte.
        </p>

        {erro && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <form onSubmit={enviar} className="mt-8 space-y-8">
          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Seus dados
            </legend>

            <div>
              <label className={rotuloClasse} htmlFor="nome">Seu nome</label>
              <input id="nome" className={campoClasse} required
                value={campos.nome} onChange={(e) => atualizar('nome', e.target.value)} />
            </div>

            <div>
              <label className={rotuloClasse} htmlFor="email">E-mail</label>
              <input id="email" type="email" className={campoClasse} required
                value={campos.email} onChange={(e) => atualizar('email', e.target.value)} />
            </div>

            <div>
              <label className={rotuloClasse} htmlFor="senha">Senha</label>
              <input id="senha" type="password" className={campoClasse} required minLength={8}
                aria-describedby="senha-ajuda"
                value={campos.senha} onChange={(e) => atualizar('senha', e.target.value)} />
              <p id="senha-ajuda" className="mt-1 text-xs text-stone-500">Ao menos 8 caracteres.</p>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Seu restaurante
            </legend>

            <div>
              <label className={rotuloClasse} htmlFor="restauranteNome">Nome do restaurante</label>
              <input id="restauranteNome" className={campoClasse} required
                value={campos.restauranteNome} onChange={(e) => atualizar('restauranteNome', e.target.value)} />
            </div>

            <div>
              <label className={rotuloClasse} htmlFor="cnpj">CNPJ</label>
              <input id="cnpj" ref={cnpjRef} className={campoClasse} required inputMode="numeric"
                value={formatarCnpj(campos.cnpj)}
                onChange={alterarCnpj} />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Endereço
            </legend>
            <p className="text-sm text-ink-600">
              É daqui que a IA calcula a taxa de entrega dos seus pedidos.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={rotuloClasse} htmlFor="cep">CEP</label>
                <input id="cep" className={campoClasse} required inputMode="numeric"
                  aria-describedby={enderecoCepDivergente ? 'cep-aviso' : undefined}
                  value={campos.cep} onBlur={completarPeloCep}
                  onChange={(e) => atualizar('cep', e.target.value)} />
                {enderecoCepDivergente && (
                  <p id="cep-aviso" role="status" className="mt-1.5 text-xs text-amber-700">
                    O endereço deste CEP é outro.{' '}
                    <button type="button" onClick={usarEnderecoDoCep}
                      className="font-semibold underline hover:text-amber-800">
                      Usar o endereço deste CEP
                    </button>
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className={rotuloClasse} htmlFor="logradouro">Rua</label>
                <input id="logradouro" className={campoClasse} required
                  value={campos.logradouro} onChange={(e) => atualizar('logradouro', e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={rotuloClasse} htmlFor="numero">Número</label>
                <input id="numero" className={campoClasse} required
                  value={campos.numero} onChange={(e) => atualizar('numero', e.target.value)} />
              </div>

              <div>
                <label className={rotuloClasse} htmlFor="complemento">Complemento</label>
                <input id="complemento" className={campoClasse}
                  value={campos.complemento} onChange={(e) => atualizar('complemento', e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={rotuloClasse} htmlFor="bairro">Bairro</label>
                <input id="bairro" className={campoClasse} required
                  value={campos.bairro} onChange={(e) => atualizar('bairro', e.target.value)} />
              </div>

              <div>
                <label className={rotuloClasse} htmlFor="cidade">Cidade</label>
                <input id="cidade" className={campoClasse} required
                  value={campos.cidade} onChange={(e) => atualizar('cidade', e.target.value)} />
              </div>

              <div>
                <label className={rotuloClasse} htmlFor="uf">UF</label>
                <input id="uf" className={campoClasse} required maxLength={2}
                  value={campos.uf} onChange={(e) => atualizar('uf', e.target.value.toUpperCase())} />
              </div>
            </div>
          </fieldset>

          <button type="submit" disabled={enviando}
            className="w-full rounded-lg bg-brand-700 p-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
            {enviando ? 'Criando sua conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-ink-600">
          Já tem conta? <Link to="/login" className="font-semibold text-brand-700">Entrar</Link>
        </p>
      </div>
    </Container>
  );
}
