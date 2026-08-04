import { useState } from 'react';
import { apiFetch } from '../../services/api';

export default function Ifood() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sincronizarIFood = async () => {
    setIsSyncing(true);
    setStatusMessage(null);

    try {
      const response = await apiFetch('/ifood/sync', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setStatusMessage({ type: 'success', text: data.message || 'Sincronizado com sucesso!' });
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Erro ao sincronizar.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Erro de rede. Tente novamente.' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#efeae2] p-8 font-sans text-[#111b21]">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-light">
          🍔 Integração <span className="font-bold text-[#ea1d2c]">iFood</span>
        </h1>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Coluna 1: O Formulário */}
          <div className="rounded-xl border border-[#d1d7db] bg-white p-8 shadow-sm">
            <h2 className="mb-6 flex items-center gap-2 text-xl font-medium">
              <i className="fa-solid fa-link text-[#00a884]"></i> Sincronizar Loja
            </h2>

            <div className="mb-6">
              <p className="text-sm text-gray-700">
                Sua conta já está autenticada e vinculada ao restaurante na nossa base de dados. Basta clicar no botão abaixo para buscar as informações atualizadas do iFood automaticamente.
              </p>
              <div className="mt-4 rounded bg-brand-50 p-3 text-xs text-ink-800 border border-stone-200">
                <i className="fa-solid fa-shield-halved mr-1"></i> A sincronização utiliza credenciais seguras e não expõe seus dados.
              </div>
            </div>

            <button
              onClick={sincronizarIFood}
              disabled={isSyncing}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ea1d2c] py-3 px-4 font-medium text-white shadow-md transition-colors hover:bg-[#c91825] disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isSyncing ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i> Sincronizando...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-rotate"></i> Sincronizar Cardápio
                </>
              )}
            </button>

            {statusMessage && (
              <div
                className={`mt-6 rounded-lg border p-4 text-sm font-medium ${
                  statusMessage.type === 'success'
                    ? 'border-[#047857] bg-[#dcf8c6] text-[#0b5e46]'
                    : 'border-red-300 bg-red-100 text-red-800'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <i className="fa-solid fa-circle-check mr-2"></i>
                ) : (
                  <i className="fa-solid fa-circle-exclamation mr-2"></i>
                )}
                {statusMessage.text}
              </div>
            )}
          </div>

          {/* Coluna 2: Instruções */}
          <div className="rounded-xl border border-[#d1d7db] bg-[#f0f2f5] p-8 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-[#00a884]">O que é sincronizado?</h3>

            <ul className="space-y-4 pl-2 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#00a884]">
                  <i className="fa-solid fa-check"></i>
                </span>
                <div><b>Categorias e Produtos:</b> Importamos todo o seu cardápio ativo para a IA aprender o que você vende.</div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#00a884]">
                  <i className="fa-solid fa-check"></i>
                </span>
                <div><b>Preços:</b> Mantemos os preços base atualizados (excluindo promoções temporárias no app).</div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#00a884]">
                  <i className="fa-solid fa-check"></i>
                </span>
                <div><b>Disponibilidade:</b> O que está pausado no iFood também fica oculto para a IA vender.</div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
