import { Routes, Route } from 'react-router-dom'
import { CubeProvider } from 'drizzle-cube/client'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ConnectionsPage from './pages/ConnectionsPage'
import CubeDefinitionsPage from './pages/CubeDefinitionsPage'
import DashboardListPage from './pages/DashboardListPage'
import DashboardViewPage from './pages/DashboardViewPage'
import AnalysisBuilderPage from './pages/AnalysisBuilderPage'
import NotebooksListPage from './pages/NotebooksListPage'
import NotebookViewPage from './pages/NotebookViewPage'

function App() {
  return (
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
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/cube-definitions" element={<CubeDefinitionsPage />} />
          <Route path="/dashboards" element={<DashboardListPage />} />
          <Route path="/dashboards/:id" element={<DashboardViewPage />} />
          <Route path="/analysis-builder" element={<AnalysisBuilderPage />} />
          <Route path="/notebooks" element={<NotebooksListPage />} />
          <Route path="/notebooks/:id" element={<NotebookViewPage />} />
        </Routes>
      </Layout>
    </CubeProvider>
  )
}

export default App
