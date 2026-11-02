import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { ErrorState, errorText } from '../components/StatusViews'

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <ErrorState message="This page does not exist." />,
  errorComponent: ({ error, reset }) => <ErrorState message={errorText(error)} onRetry={reset} />,
})

function RootLayout() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Bill Splitter
        </Link>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
