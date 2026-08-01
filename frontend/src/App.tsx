import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import SiteLayout from './components/layout/SiteLayout';
import Landing from './pages/site/Landing';
import Sobre from './pages/site/Sobre';
import Cadastro from './pages/site/Cadastro';
import NaoEncontrado from './pages/site/NaoEncontrado';
import ProtectedRoute from './components/ProtectedRoute';

// O painel so e baixado quando o usuario entra nele. Sem isso, um
// visitante da landing carregaria o bundle inteiro para ver a home.
const Login = lazy(() => import('./pages/app/Login'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Crm = lazy(() => import('./pages/app/Crm'));
const Ifood = lazy(() => import('./pages/app/Ifood'));

const Carregando = () => (
  <div className="py-24 text-center text-sm text-ink-600">Carregando…</div>
);

export default function App() {
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        {/* Site publico: herda Header e Footer via SiteLayout */}
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/sobre" element={<Sobre />} />
          <Route path="/cadastro" element={<Cadastro />} />
          {/* As tres rotas legais entram no Task 6, junto com o LegalPage */}
          <Route path="*" element={<NaoEncontrado />} />
        </Route>

        {/* Painel: fora do layout do site, tera navegacao propria no ciclo 3 */}
        <Route path="/login" element={<Login />} />
        <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/app/crm" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
        <Route path="/app/ifood" element={<ProtectedRoute><Ifood /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  );
}
