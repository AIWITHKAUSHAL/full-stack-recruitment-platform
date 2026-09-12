import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';

// Route-level code splitting: a candidate browsing jobs never downloads the
// admin console, which keeps the first paint small (and the CloudFront bill low).
const HomePage = lazy(() => import('@/pages/HomePage'));
const JobsPage = lazy(() => import('@/pages/JobsPage'));
const JobDetailPage = lazy(() => import('@/pages/JobDetailPage'));
const ApplicationPage = lazy(() => import('@/pages/ApplicationPage'));
const TrackApplicationPage = lazy(() => import('@/pages/TrackApplicationPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const AdminLoginPage = lazy(() => import('@/pages/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage'));
const AdminJobsPage = lazy(() => import('@/pages/AdminJobsPage'));
const AdminJobFormPage = lazy(() => import('@/pages/AdminJobFormPage'));
const AdminApplicationsPage = lazy(() => import('@/pages/AdminApplicationsPage'));
const AdminApplicationDetailPage = lazy(() => import('@/pages/AdminApplicationDetailPage'));

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* ---------------------------------------------------- public ---- */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          <Route path="/jobs/:jobId/apply" element={<ApplicationPage />} />
          <Route path="/track" element={<TrackApplicationPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* ----------------------------------------------------- admin ---- */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/jobs" element={<AdminJobsPage />} />
            <Route path="/admin/jobs/new" element={<AdminJobFormPage />} />
            <Route path="/admin/jobs/:jobId" element={<AdminJobFormPage />} />
            <Route path="/admin/applications" element={<AdminApplicationsPage />} />
            <Route path="/admin/applications/:applicationId" element={<AdminApplicationDetailPage />} />
            <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
