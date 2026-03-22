import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import Layout from './components/Layout'
import AnalysisBuilderPage from './pages/AnalysisBuilderPage'
import DashboardListPage from './pages/DashboardListPage'
import DashboardViewPage from './pages/DashboardViewPage'
import DataBrowserPage from './pages/DataBrowserPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MagicLinkVerifyPage from './pages/MagicLinkVerifyPage'
import NotebookViewPage from './pages/NotebookViewPage'
import NotebooksListPage from './pages/NotebooksListPage'
import PendingSetupPage from './pages/PendingSetupPage'
import RegisterPage from './pages/RegisterPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SchemaEditorPage from './pages/SchemaEditorPage'
import SchemaExplorerPage from './pages/SchemaExplorerPage'
import SetupPage from './pages/SetupPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import SettingsPage from './pages/settings/SettingsPage'

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

  return <SchemaEditorPage />
}

function App() {
  return (
    <Routes>
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
            </Layout>
          </AuthGuard>
        }
      />
    </Routes>
  )
}

export default App
