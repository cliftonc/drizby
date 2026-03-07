import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import Layout from './components/Layout'
import AnalysisBuilderPage from './pages/AnalysisBuilderPage'
import DashboardListPage from './pages/DashboardListPage'
import DashboardViewPage from './pages/DashboardViewPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NotebookViewPage from './pages/NotebookViewPage'
import NotebooksListPage from './pages/NotebooksListPage'
import RegisterPage from './pages/RegisterPage'
import SchemaEditorPage from './pages/SchemaEditorPage'
import SetupPage from './pages/SetupPage'
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
      <Route path="/setup" element={<SetupPage />} />
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
