import { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';

interface MetricasDashboard {
  faturamento: number;
  pedidosConcluidos: number;
  ticketMedio: number;
  novosClientes: number;
  creditosConsumidos: number;
  interacoesIa: number;
}

export default function Dashboard() {
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    carregarMetricas();
  }, []);

  const carregarMetricas = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/dashboard/metricas');
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar métricas');
      }
      
      setMetricas(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  return (
    <div className="min-h-screen bg-[#efeae2] p-8 font-sans text-[#111b21]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col items-start justify-between sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-light">Visão Geral</h1>
            <p className="mt-1 text-sm text-gray-600">
              Desempenho da loja nos <span className="font-semibold text-[#00a884]">Últimos 30 dias</span>.
            </p>
          </div>
          <button 
            onClick={carregarMetricas}
            disabled={isLoading}
            className="mt-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#00a884] focus:ring-offset-2 sm:mt-0 disabled:opacity-50"
          >
            <i className={`fa-solid fa-rotate-right ${isLoading ? 'fa-spin text-[#00a884]' : ''}`}></i> 
            Atualizar
          </button>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
            <i className="fa-solid fa-triangle-exclamation mr-2"></i> {error}
          </div>
        )}

        {/* Grupo 1: Métricas Financeiras e Operacionais */}
        <h2 className="mb-4 text-xl font-medium text-gray-800"><i className="fa-solid fa-chart-line mr-2 text-[#00a884]"></i> Desempenho Operacional</h2>
        <div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          
          <MetricCard 
            title="Faturamento" 
            value={metricas ? formatarMoeda(metricas.faturamento) : '---'} 
            icon="fa-brazilian-real-sign" 
            iconBg="bg-green-100" 
            iconColor="text-green-600" 
            isLoading={isLoading} 
          />
          
          <MetricCard 
            title="Pedidos Concluídos" 
            value={metricas ? metricas.pedidosConcluidos.toString() : '---'} 
            icon="fa-bag-shopping" 
            iconBg="bg-blue-100" 
            iconColor="text-blue-600" 
            isLoading={isLoading} 
          />
          
          <MetricCard 
            title="Ticket Médio" 
            value={metricas ? formatarMoeda(metricas.ticketMedio) : '---'} 
            icon="fa-receipt" 
            iconBg="bg-yellow-100" 
            iconColor="text-yellow-600" 
            isLoading={isLoading} 
          />
          
          <MetricCard 
            title="Novos Clientes" 
            value={metricas ? metricas.novosClientes.toString() : '---'} 
            icon="fa-users" 
            iconBg="bg-purple-100" 
            iconColor="text-purple-600" 
            isLoading={isLoading} 
          />

        </div>

        {/* Grupo 2: Inteligência Artificial */}
        <h2 className="mb-4 text-xl font-medium text-gray-800"><i className="fa-solid fa-robot mr-2 text-[#ea1d2c]"></i> Motor de Inteligência Artificial</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          
          <div className="group relative overflow-hidden rounded-2xl border border-transparent bg-white p-6 shadow-sm transition-all hover:border-[#ea1d2c]/30 hover:shadow-md">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-red-50 transition-transform group-hover:scale-150"></div>
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Interações da IA</p>
                <div className="mt-2 flex items-baseline gap-2">
                  {isLoading ? (
                    <div className="h-10 w-24 animate-pulse rounded-md bg-gray-200"></div>
                  ) : (
                    <span className="text-4xl font-bold tracking-tight text-gray-900">{metricas?.interacoesIa || 0}</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">Atendimentos bem sucedidos via WhatsApp</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-[#ea1d2c]">
                <i className="fa-solid fa-comment-dots text-xl"></i>
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-transparent bg-white p-6 shadow-sm transition-all hover:border-[#ea1d2c]/30 hover:shadow-md">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-orange-50 transition-transform group-hover:scale-150"></div>
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Créditos Consumidos</p>
                <div className="mt-2 flex items-baseline gap-2">
                  {isLoading ? (
                    <div className="h-10 w-24 animate-pulse rounded-md bg-gray-200"></div>
                  ) : (
                    <span className="text-4xl font-bold tracking-tight text-gray-900">{metricas?.creditosConsumidos || 0}</span>
                  )}
                  <span className="text-sm font-medium text-gray-500">créditos</span>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <i className="fa-solid fa-circle-info text-gray-400"></i>
                  Texto = 1 | Áudio = 3
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <i className="fa-solid fa-bolt text-xl"></i>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Componente auxiliar para os cards de métricas
function MetricCard({ 
  title, 
  value, 
  icon, 
  iconBg, 
  iconColor, 
  isLoading 
}: { 
  title: string; 
  value: string; 
  icon: string; 
  iconBg: string; 
  iconColor: string; 
  isLoading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <div className="mt-2">
            {isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded bg-gray-200"></div>
            ) : (
              <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
            )}
          </div>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}>
          <i className={`fa-solid ${icon} text-lg`}></i>
        </div>
      </div>
    </div>
  );
}
