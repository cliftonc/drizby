import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import Layout from './components/Layout'

// Public pages — no auth required
import PublicDashboardPage from './pages/PublicDashboardPage'

// Light pages — keep static for instant navigation
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import LoginPage from './pages/LoginPage'
import MagicLinkVerifyPage from './pages/MagicLinkVerifyPage'
import PendingSetupPage from './pages/PendingSetupPage'
import RegisterPage from './pages/RegisterPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SetupPage from './pages/SetupPage'
import VerifyEmailPage from './pages/VerifyEmailPage'

// Heavy pages — lazy-loaded (code-split into separate chunks)
const HomePage = lazy(() => import('./pages/HomePage'))
const DashboardListPage = lazy(() => import('./pages/DashboardListPage'))
const DashboardViewPage = lazy(() => import('./pages/DashboardViewPage'))
const AnalysisBuilderPage = lazy(() => import('./pages/AnalysisBuilderPage'))
const SchemaExplorerPage = lazy(() => import('./pages/SchemaExplorerPage'))
const DataBrowserPage = lazy(() => import('./pages/DataBrowserPage'))
const SchemaEditorPage = lazy(() => import('./pages/SchemaEditorPage'))
const NotebooksListPage = lazy(() => import('./pages/NotebooksListPage'))
const NotebookViewPage = lazy(() => import('./pages/NotebookViewPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))

function LoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--dc-text-muted)',
        fontSize: 13,
      }}
    >
      Loading...
    </div>
  )
}

/** Redirects bare /schema-editor and /schema-editor/:connId to last-visited file URL */
function SchemaEditorRedirect() {
  const { connectionId } = useParams()

  if (connectionId) {
    const raw = localStorage.getItem(`dc-schema-editor-conn-${connectionId}`)
    if (raw) {
      try {
        const { fileType, fileName } = JSON.parse(raw)
        if (fileType && fileName) {
          return (
            <Navigate
              to={`/schema-editor/${connectionId}/${fileType}/${encodeURIComponent(fileName)}`}
              replace
            />
          )
        }
      } catch {}
    }
  } else {
    const raw = localStorage.getItem('dc-schema-editor-last')
    if (raw) {
      try {
        const { connectionId: connId, fileType, fileName } = JSON.parse(raw)
        if (connId && fileType && fileName) {
          return (
            <Navigate
              to={`/schema-editor/${connId}/${fileType}/${encodeURIComponent(fileName)}`}
              replace
            />
          )
        }
      } catch {}
    }
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <SchemaEditorPage />
    </Suspense>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/public/dashboard/:token" element={<PublicDashboardPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/magic-link/verify" element={<MagicLinkVerifyPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/pending-setup" element={<PendingSetupPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <Layout>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/dashboards" element={<DashboardListPage />} />
                  <Route path="/dashboards/:id" element={<DashboardViewPage />} />
                  <Route path="/analysis-builder" element={<AnalysisBuilderPage />} />
                  <Route path="/schema-explorer" element={<SchemaExplorerPage />} />
                  <Route path="/data-browser" element={<DataBrowserPage />} />
                  <Route path="/schema-editor" element={<SchemaEditorRedirect />} />
                  <Route path="/schema-editor/:connectionId" element={<SchemaEditorRedirect />} />
                  <Route
                    path="/schema-editor/:connectionId/:fileType/:fileName"
                    element={<SchemaEditorPage />}
                  />
                  <Route path="/notebooks" element={<NotebooksListPage />} />
                  <Route path="/notebooks/:id" element={<NotebookViewPage />} />
                  <Route path="/settings/*" element={<SettingsPage />} />
                </Routes>
              </Suspense>
            </Layout>
          </AuthGuard>
        }
      />
    </Routes>
  )
}

export default App
