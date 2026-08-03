import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Container from '../../components/ui/Container';
import { API_URL } from '../../services/api';

const rotuloClasse = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-600';
const campoClasse =
  'w-full rounded-lg border border-stone-300 bg-white p-3 text-sm text-ink-800 ' +
  'focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

// Mensagem devolvida quando o token não existe, expirou ou já foi usado —
// reproduz o texto que o backend manda em consumirTokenERedefinir.
const MENSAGEM_LINK_INVALIDO_PADRAO = 'Link inválido ou expirado. Solicite uma nova recuperação de senha.';

export default function RedefinirSenha() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [tokenInvalido, setTokenInvalido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setTokenInvalido(false);

    // Validação local antes de gastar requisição: mesmo mínimo de 8
    // caracteres exigido pelo backend em consumirTokenERedefinir.
    if (senha.length < 8) {
      setErro('A senha precisa ter ao menos 8 caracteres.');
      return;
    }

    if (senha !== confirmarSenha) {
      setErro('As senhas não conferem.');
      return;
    }

    setEnviando(true);

    try {
      const resposta = await fetch(`${API_URL}/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      });

      const dados = await resposta.json();

      if (resposta.ok && dados.success) {
        navigate('/login', { state: { aviso: 'Senha redefinida com sucesso. Faça login com sua nova senha.' } });
        return;
      }

      // Um link inválido/expirado é um caso à parte: além do erro, a
      // pessoa precisa de um caminho para pedir outro link, sem precisar
      // adivinhar que deve voltar para "esqueci minha senha".
      setErro(dados.error || MENSAGEM_LINK_INVALIDO_PADRAO);
      setTokenInvalido(true);
    } catch {
      setErro('Erro de conexão com o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Redefinir senha
        </h1>
        <p className="mt-3 text-ink-600">
          Escolha uma nova senha para acessar sua conta.
        </p>

        {erro && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
            {tokenInvalido && (
              <p className="mt-2">
                <Link to="/esqueci-senha" className="font-semibold underline hover:text-red-800">
                  Solicitar um novo link
                </Link>
              </p>
            )}
          </div>
        )}

        <form onSubmit={enviar} className="mt-8 space-y-4">
          <div>
            <label className={rotuloClasse} htmlFor="senha">Nova senha</label>
            <input id="senha" type="password" className={campoClasse} required minLength={8}
              aria-describedby="senha-ajuda"
              value={senha} onChange={(e) => setSenha(e.target.value)} />
            <p id="senha-ajuda" className="mt-1 text-xs text-stone-500">Ao menos 8 caracteres.</p>
          </div>

          <div>
            <label className={rotuloClasse} htmlFor="confirmarSenha">Confirme a nova senha</label>
            <input id="confirmarSenha" type="password" className={campoClasse} required minLength={8}
              value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
          </div>

          <button type="submit" disabled={enviando}
            className="w-full rounded-lg bg-brand-700 p-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
            {enviando ? 'Redefinindo...' : 'Redefinir senha'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-ink-600">
          Lembrou a senha? <Link to="/login" className="font-semibold text-brand-700">Entrar</Link>
        </p>
      </div>
    </Container>
  );
}
