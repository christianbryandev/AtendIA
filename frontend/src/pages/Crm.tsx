import { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';

type EstagioPipeline = 'novo_contato' | 'pedido_em_andamento' | 'cliente_ativo' | 'vip_recorrente' | 'em_risco';

interface Cliente {
  id: string;
  nome?: string;
  telefone_whatsapp?: string;
  logradouro?: string;
  numero?: string;
  total_pedidos?: number;
  valor_total_gasto?: number;
  pontos_fidelidade?: number;
  estagio_pipeline: EstagioPipeline;
  problema_ativo?: boolean;
  ultima_mensagem_em?: string;
  ultimo_pedido_at?: string;
}

export default function Crm() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    carregarCRM();
  }, []);

  const carregarCRM = async () => {
    try {
      const res = await apiFetch('/crm/clientes');
      const data = await res.json();
      setClientes(data.clientes || []);
    } catch (err) {
      console.error('Erro ao carregar CRM:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const moverCliente = async (clienteId: string, novoEstagio: EstagioPipeline) => {
    // Atualização otimista
    setClientes((prev) => 
      prev.map(c => c.id === clienteId ? { ...c, estagio_pipeline: novoEstagio } : c)
    );

    try {
      await apiFetch('/crm/estagio', {
        method: 'PUT',
        body: JSON.stringify({ clienteId, novoEstagio })
      });
    } catch (err) {
      alert("Erro ao mover cliente");
      carregarCRM(); // Reverte em caso de falha
    }
  };

  const dispararReativacaoManual = async (cliente: Cliente) => {
    const confirmar = window.confirm(
      `Deseja enviar cupom de reativação para ${cliente.nome || cliente.telefone_whatsapp}?`
    );
    if (!confirmar) return;

    // Simulação da chamada pra envio
    setIsSending(true);
    try {
      const res = await apiFetch('/crm/reativacao', {
        method: 'POST',
        body: JSON.stringify({ diasAusente: 30 }), // Padrão
      });
      await res.json();
      alert(`Campanha enviada para ${cliente.telefone_whatsapp}!`);
    } catch (err) {
      alert("Erro ao disparar campanha.");
    } finally {
      setIsSending(false);
    }
  };

  const isConversaAtiva = (ultimaMensagemEm?: string) => {
    if (!ultimaMensagemEm) return false;
    const diffMinutos = (new Date().getTime() - new Date(ultimaMensagemEm).getTime()) / (1000 * 60);
    return diffMinutos <= 15; // Threshold de 15 minutos escolhido
  };

  const colunas: { id: EstagioPipeline, titulo: string, cor: string }[] = [
    { id: 'novo_contato', titulo: 'Novo Contato', cor: 'border-blue-500 bg-blue-50 text-blue-800' },
    { id: 'pedido_em_andamento', titulo: 'Pedido em Andamento', cor: 'border-yellow-500 bg-yellow-50 text-yellow-800' },
    { id: 'cliente_ativo', titulo: 'Cliente Ativo', cor: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
    { id: 'vip_recorrente', titulo: 'VIP Recorrente', cor: 'border-purple-500 bg-purple-50 text-purple-800' },
    { id: 'em_risco', titulo: 'Em Risco', cor: 'border-red-500 bg-red-50 text-red-800' },
  ];

  const totalClientes = clientes.length;
  const totalLtv = clientes.reduce((acc, c) => acc + Number(c.valor_total_gasto || 0), 0);
  const ltvMedio = totalClientes > 0 ? totalLtv / totalClientes : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-900">
      <div className="mx-auto flex h-full max-w-full flex-col">
        <header className="mb-8 flex flex-col justify-between border-b border-gray-200 pb-4 md:flex-row md:items-center">
          <div className="mb-4 md:mb-0">
            <h1 className="text-2xl font-bold text-sky-600">📊 Kanban de Vendas e CRM</h1>
            <p className="mt-1 text-sm text-gray-500">
              Pipeline de clientes 100% automatizado por eventos
            </p>
          </div>
        </header>

        {/* Indicadores de Topo */}
        <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Total de Clientes</div>
            <div className="text-3xl font-bold text-gray-900">{isLoading ? '--' : totalClientes}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">LTV Médio (Total Gasto)</div>
            <div className="text-3xl font-bold text-emerald-600">
              {isLoading ? 'R$ --' : `R$ ${ltvMedio.toFixed(2)}`}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Clientes VIPs</div>
            <div className="text-3xl font-bold text-purple-600">
              {isLoading ? '--' : clientes.filter(c => c.estagio_pipeline === 'vip_recorrente').length}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Em Risco</div>
            <div className="text-3xl font-bold text-red-600">
              {isLoading ? '--' : clientes.filter(c => c.estagio_pipeline === 'em_risco').length}
            </div>
          </div>
        </div>

        {/* KANBAN BOARD */}
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {colunas.map((col) => {
            const clientesColuna = clientes.filter(c => c.estagio_pipeline === col.id);
            return (
              <div 
                key={col.id} 
                className="flex w-80 flex-shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-100 p-3 shadow-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const clienteId = e.dataTransfer.getData('clienteId');
                  if (clienteId) moverCliente(clienteId, col.id);
                }}
              >
                <div className={`mb-3 rounded-lg border-t-4 p-2 text-sm font-bold shadow-sm ${col.cor}`}>
                  {col.titulo} ({clientesColuna.length})
                </div>
                
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                  {clientesColuna.map(cliente => (
                    <div 
                      key={cliente.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('clienteId', cliente.id)}
                      className="group relative cursor-grab rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                    >
                      {/* Badges de Topo */}
                      <div className="mb-2 flex items-center justify-between">
                        {isConversaAtiva(cliente.ultima_mensagem_em) ? (
                          <span className="flex items-center text-xs font-semibold text-emerald-600">
                            <span className="mr-1 h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span> Conversando
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Inativo agora</span>
                        )}
                        
                        {cliente.problema_ativo && (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                            Problema
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-gray-900">{cliente.nome || 'Sem nome'}</h3>
                      <p className="text-xs text-gray-500">{cliente.telefone_whatsapp}</p>
                      
                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-600">
                        <span><i className="fa-solid fa-bag-shopping mr-1"></i> {cliente.total_pedidos || 0}</span>
                        <span className="font-semibold text-emerald-600">R$ {Number(cliente.valor_total_gasto || 0).toFixed(2)}</span>
                      </div>

                      {col.id === 'em_risco' && (
                        <button
                          onClick={() => dispararReativacaoManual(cliente)}
                          disabled={isSending}
                          className="mt-3 w-full rounded border border-red-200 bg-red-50 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                        >
                          <i className="fa-solid fa-bullhorn mr-1"></i> Disparar Cupom
                        </button>
                      )}
                    </div>
                  ))}
                  {clientesColuna.length === 0 && !isLoading && (
                    <div className="mt-4 text-center text-sm text-gray-400">Nenhum cliente</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
