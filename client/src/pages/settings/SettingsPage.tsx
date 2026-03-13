import { Route, Routes } from 'react-router-dom'
import ConnectionsPage from '../ConnectionsPage'
import AISettingsPage from './AISettingsPage'
import GeneralSettings from './GeneralSettings'
import GroupsPage from './GroupsPage'
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
          <Route path="connections" element={<ConnectionsPage />} />
        </Routes>
      </div>
    </div>
  )
}
