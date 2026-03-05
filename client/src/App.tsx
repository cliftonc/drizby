import { Routes, Route } from 'react-router-dom'
import { CubeProvider } from 'drizzle-cube/client'
import Layout from './components/Layout'
import AuthGuard from './components/AuthGuard'
import HomePage from './pages/HomePage'
import DashboardListPage from './pages/DashboardListPage'
import DashboardViewPage from './pages/DashboardViewPage'
import AnalysisBuilderPage from './pages/AnalysisBuilderPage'
import NotebooksListPage from './pages/NotebooksListPage'
import NotebookViewPage from './pages/NotebookViewPage'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import SettingsPage from './pages/settings/SettingsPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/*" element={
        <AuthGuard>
          <CubeProvider
            apiOptions={{ apiUrl: '/cubejs-api/v1' }}
            features={{
              showSchemaDiagram: true,
              useAnalysisBuilder: true,
              thumbnail: {
                enabled: true,
                format: 'png'
              }
            }}
          >
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/dashboards" element={<DashboardListPage />} />
                <Route path="/dashboards/:id" element={<DashboardViewPage />} />
                <Route path="/analysis-builder" element={<AnalysisBuilderPage />} />
                <Route path="/notebooks" element={<NotebooksListPage />} />
                <Route path="/notebooks/:id" element={<NotebookViewPage />} />
                <Route path="/settings/*" element={<SettingsPage />} />
              </Routes>
            </Layout>
          </CubeProvider>
        </AuthGuard>
      } />
    </Routes>
  )
}

export default App
