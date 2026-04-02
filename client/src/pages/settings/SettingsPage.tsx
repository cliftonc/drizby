import { Route, Routes } from 'react-router-dom'
import ConnectionsPage from '../ConnectionsPage'
import AISettingsPage from './AISettingsPage'
import AuthProvidersPage from './AuthProvidersPage'
import DataSettingsPage from './DataSettingsPage'
import GeneralSettings from './GeneralSettings'
import GitHubAppPage from './GitHubAppPage'
import GroupsPage from './GroupsPage'
import McpServerPage from './McpServerPage'
import MetabaseImportPage from './MetabaseImportPage'
import ServerFeaturesPage from './ServerFeaturesPage'
import SettingsNav from './SettingsNav'
import TeamPage from './TeamPage'

export default function SettingsPage() {
  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-8 h-full">
      <SettingsNav />
      <div className="flex-1 min-w-0 overflow-auto">
        <Routes>
          <Route index element={<GeneralSettings />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="ai" element={<AISettingsPage />} />
          <Route path="auth" element={<AuthProvidersPage />} />
          <Route path="features" element={<ServerFeaturesPage />} />
          <Route path="mcp" element={<McpServerPage />} />
          <Route path="github-app" element={<GitHubAppPage />} />
          <Route path="data" element={<DataSettingsPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="metabase-import" element={<MetabaseImportPage />} />
        </Routes>
      </div>
    </div>
  )
}
