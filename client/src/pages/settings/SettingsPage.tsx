import { Routes, Route } from 'react-router-dom'
import SettingsNav from './SettingsNav'
import GeneralSettings from './GeneralSettings'
import TeamPage from './TeamPage'
import ConnectionsPage from '../ConnectionsPage'
import AISettingsPage from './AISettingsPage'

export default function SettingsPage() {
  return (
    <div className="flex gap-8 h-full">
      <SettingsNav />
      <div className="flex-1 min-w-0">
        <Routes>
          <Route index element={<GeneralSettings />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="ai" element={<AISettingsPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
        </Routes>
      </div>
    </div>
  )
}
