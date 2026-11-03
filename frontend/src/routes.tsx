import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout';
import { HomePage } from './pages/HomePage';
import { MatchPage } from './pages/MatchPage';
import { NotFoundPage } from './pages/NotFoundPage';

const AdminPage = React.lazy(() => import('./pages/AdminPage'));
const LabPage = React.lazy(() => import('./pages/LabPage'));

const PageLoader: React.FC = () => (
  <div className="flex-1 min-h-[300px] flex items-center justify-center text-xs font-mono text-ink-3">
    Đang tải trang...
  </div>
);

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<HomePage />} />
        <Route path="play" element={<MatchPage />} />
        <Route path="match/:matchId" element={<MatchPage />} />
        <Route
          path="lab"
          element={
            <Suspense fallback={<PageLoader />}>
              <LabPage />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
