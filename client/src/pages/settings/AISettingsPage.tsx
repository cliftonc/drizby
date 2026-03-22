import { AIConfigForm } from '../../components/AIConfigForm'

export default function AISettingsPage() {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        AI Configuration
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Configure the default AI provider for notebooks. Users can still override with their own
        key.
      </p>
      <AIConfigForm />
    </div>
  )
}
