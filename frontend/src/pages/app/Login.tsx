import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from '../../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Aviso vindo do redirecionamento apos redefinir a senha com sucesso.
  const aviso = (location.state as { aviso?: string } | null)?.aviso;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('auth_token', data.token);
        navigate('/app/dashboard');
      } else {
        setError(data.error || 'E-mail ou senha incorretos.');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl border border-gray-100">
        <div className="mb-8 text-center">
          <div className="mb-3 text-4xl text-brand-700">
            <i className="fa-solid fa-robot"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Painel de Gestão IA</h1>
          <p className="mt-1 text-sm text-gray-500">Acesse o painel do seu restaurante</p>
        </div>

        {aviso && (
          <div role="status" className="mb-5 rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-100">
            {aviso}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-5">
            <label className="mb-2 block text-xs font-semibold uppercase text-gray-600" htmlFor="email">
              E-mail de Acesso
            </label>
            <input
              type="email"
              id="email"
              className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="seuemail@restaurante.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-xs font-semibold uppercase text-gray-600" htmlFor="password">
              Senha
            </label>
            <input
              type="password"
              id="password"
              className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="mt-2 text-right">
              <Link to="/esqueci-senha" className="text-xs font-semibold text-brand-700 hover:text-brand-900">
                Esqueci minha senha
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full rounded-lg bg-brand-700 p-3 text-sm font-bold text-white transition-colors hover:bg-brand-800 disabled:opacity-70"
          >
            {isLoading ? 'Entrando...' : 'Entrar no Painel'}
          </button>
        </form>
      </div>
    </div>
  );
}
