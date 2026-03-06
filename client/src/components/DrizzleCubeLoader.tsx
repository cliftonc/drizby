export const DashboardLoader = () => (
  <div className="flex items-center justify-center">
    <img
      src="/logo.png"
      alt="Loading..."
      className="h-10 w-10 animate-spin"
      style={{ animationDuration: '1.5s' }}
    />
  </div>
)

export const NotebookLoader = () => (
  <img
    src="/logo.png"
    alt="Loading..."
    className="h-full w-full animate-spin"
    style={{ animationDuration: '1.5s' }}
  />
)

export default DashboardLoader
