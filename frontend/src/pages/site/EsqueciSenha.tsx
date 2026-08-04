import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container';
import { API_URL } from '../../services/api';

const rotuloClasse = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-600';
const campoClasse =
  'w-full rounded-lg border border-stone-300 bg-white p-3 text-sm text-ink-800 ' +
  'focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

// Mesma mensagem neutra que o backend devolve em /api/auth/esqueci-senha,
// exista a conta ou não. Não podemos variar esta mensagem por nenhum
// motivo — nem em caso de erro de validação local — senão a tela vira
// uma ferramenta para descobrir quais e-mails são clientes.
const MENSAGEM_NEUTRA = 'Se este e-mail estiver cadastrado, você receberá as instruções.';

export default function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErroConexao(null);
    setEnviando(true);

    try {
      const resposta = await fetch(`${API_URL}/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const dados = await resposta.json();

      // A confirmação é sempre a mesma, exista a conta ou não — o
      // backend garante isso, e a tela não pode adicionar variação por
      // cima (ex.: mostrando "e-mail não encontrado" num caminho de erro).
      setMensagem(dados.message || MENSAGEM_NEUTRA);
    } catch {
      // Erro de conexão é uma falha de rede real, não relacionada a se a
      // conta existe — não vaza informação sobre o e-mail.
      setErroConexao('Erro de conexão com o servidor. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Esqueci minha senha
        </h1>
        <p className="mt-3 text-ink-600">
          Informe seu e-mail de cadastro e enviaremos as instruções para redefinir sua senha.
        </p>

        {mensagem && (
          <div role="status" className="mt-6 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
            {mensagem}
          </div>
        )}

        {erroConexao && (
          <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erroConexao}
          </div>
        )}

        {!mensagem && (
          <form onSubmit={enviar} className="mt-8 space-y-4">
            <div>
              <label className={rotuloClasse} htmlFor="email">E-mail</label>
              <input id="email" type="email" className={campoClasse} required
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <button type="submit" disabled={enviando}
              className="w-full rounded-lg bg-brand-700 p-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70">
              {enviando ? 'Enviando...' : 'Enviar instruções'}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-ink-600">
          Lembrou a senha? <Link to="/login" className="font-semibold text-brand-700">Entrar</Link>
        </p>
      </div>
    </Container>
  );
}
