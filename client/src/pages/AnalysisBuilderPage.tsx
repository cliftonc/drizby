import { AnalysisBuilder } from 'drizzle-cube/client'

export default function AnalysisBuilderPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-dc-text">Analysis Builder</h1>
        <p className="mt-1 text-sm text-dc-text-secondary leading-relaxed">
          Build analytics queries with Metrics (measures), Breakdowns (dimensions), and Filters.
          Results appear instantly as you build.
        </p>
      </div>

      <div className="flex-1 min-h-0 border border-dc-border rounded-xl overflow-hidden">
        <AnalysisBuilder maxHeight="100%" />
      </div>
    </div>
  )
}
