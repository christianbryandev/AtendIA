import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import SiteLayout from './components/layout/SiteLayout';
import Landing from './pages/site/Landing';
import Sobre from './pages/site/Sobre';
import Cadastro from './pages/site/Cadastro';
import NaoEncontrado from './pages/site/NaoEncontrado';
import ProtectedRoute from './components/ProtectedRoute';
import { AssinaturaProvider } from './contexts/AssinaturaContext';

// O painel so e baixado quando o usuario entra nele. Sem isso, um
// visitante da landing carregaria o bundle inteiro para ver a home.
// LegalPage tambem e lazy: ela arrasta react-markdown + remark-gfm + os
// tres documentos legais inteiros, que nenhum visitante da home precisa.
const LegalPage = lazy(() => import('./pages/site/LegalPage'));
const Login = lazy(() => import('./pages/app/Login'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Crm = lazy(() => import('./pages/app/Crm'));
const Ifood = lazy(() => import('./pages/app/Ifood'));
const Pagamento = lazy(() => import('./pages/app/Pagamento'));
const Confirmando = lazy(() => import('./pages/app/Confirmando'));
const Assinatura = lazy(() => import('./pages/app/Assinatura'));
const Creditos = lazy(() => import('./pages/app/Creditos'));

const Carregando = () => (
  <div className="py-24 text-center text-sm text-ink-600">Carregando…</div>
);

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <AssinaturaProvider>
        <Routes>
          {/* Site publico: herda Header e Footer via SiteLayout */}
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/sobre" element={<Sobre />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/termos" element={<LegalPage documento="termos" />} />
            <Route path="/privacidade" element={<LegalPage documento="privacidade" />} />
            <Route path="/exclusao-de-dados" element={<LegalPage documento="exclusao-de-dados" />} />
            <Route path="*" element={<NaoEncontrado />} />
          </Route>

          {/* Painel: fora do layout do site, tera navegacao propria no ciclo 3 */}
          <Route path="/login" element={<Login />} />

          {/* Pagamento e confirmacao exigem login, mas nao assinatura:
              sao justamente as telas de quem ainda nao pagou. */}
          <Route path="/assinatura/pagamento" element={<ProtectedRoute><Pagamento /></ProtectedRoute>} />
          <Route path="/assinatura/confirmando" element={<ProtectedRoute><Confirmando /></ProtectedRoute>} />

          <Route path="/app/dashboard" element={<ProtectedRoute exigirAssinatura><Dashboard /></ProtectedRoute>} />
          <Route path="/app/crm" element={<ProtectedRoute exigirAssinatura><Crm /></ProtectedRoute>} />
          <Route path="/app/ifood" element={<ProtectedRoute exigirAssinatura><Ifood /></ProtectedRoute>} />
          <Route path="/app/assinatura" element={<ProtectedRoute exigirAssinatura><Assinatura /></ProtectedRoute>} />
          <Route path="/app/creditos" element={<ProtectedRoute exigirAssinatura><Creditos /></ProtectedRoute>} />
        </Routes>
      </AssinaturaProvider>
    </Suspense>
  );
}
