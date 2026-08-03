import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';

export type StatusAssinatura =
  | 'pendente' | 'ativa' | 'inadimplente' | 'cancelada' | 'reembolsada';

interface EstadoAssinatura {
  status: StatusAssinatura | null;
  periodoFim: string | null;
  creditosCota: number;
  creditosAvulsos: number;
  cotaTotal: number;
  cancelamentoAgendadoPara: string | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
}

const ESTADO_INICIAL: EstadoAssinatura = {
  status: null,
  periodoFim: null,
  creditosCota: 0,
  creditosAvulsos: 0,
  cotaTotal: 10000,
  cancelamentoAgendadoPara: null,
  carregando: true,
  recarregar: async () => {},
};

const Contexto = createContext<EstadoAssinatura>(ESTADO_INICIAL);

export function AssinaturaProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState(ESTADO_INICIAL);

  const recarregar = useCallback(async () => {
    try {
      const resposta = await apiFetch('/billing/status');
      const dados = await resposta.json();

      if (!dados.success) {
        setEstado((a) => ({ ...a, carregando: false }));
        return;
      }

      setEstado((a) => ({
        ...a,
        status: dados.status,
        periodoFim: dados.periodoFim,
        creditosCota: dados.creditosCota,
        creditosAvulsos: dados.creditosAvulsos,
        cotaTotal: dados.cotaTotal,
        cancelamentoAgendadoPara: dados.cancelamentoAgendadoPara,
        carregando: false,
      }));
    } catch {
      // apiFetch já redireciona no 401. Aqui só evitamos travar a tela
      // em "carregando" para sempre.
      setEstado((a) => ({ ...a, carregando: false }));
    }
  }, []);

  useEffect(() => {
    setEstado((a) => ({ ...a, recarregar }));
    void recarregar();
  }, [recarregar]);

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>;
}

export function useAssinatura() {
  return useContext(Contexto);
}
