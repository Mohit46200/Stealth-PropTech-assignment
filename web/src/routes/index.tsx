import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { ErrorState, errorText } from '../components/StatusViews'
import { api } from '../lib/api'
import { loadRecentHomes } from '../lib/recent-homes'

export const Route = createFileRoute('/')({
  component: HomesPage,
})

function HomesPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [homeIdInput, setHomeIdInput] = useState('')
  const [recentHomes] = useState(loadRecentHomes)

  const createHome = useMutation({
    mutationFn: (homeName: string) => api.createHome(homeName),
    onSuccess: (home) => navigate({ to: '/homes/$homeId', params: { homeId: home.id } }),
  })

  function onCreate(event: FormEvent) {
    event.preventDefault()
    if (name.trim()) createHome.mutate(name.trim())
  }

  function onOpen(event: FormEvent) {
    event.preventDefault()
    const homeId = homeIdInput.trim()
    if (homeId) navigate({ to: '/homes/$homeId', params: { homeId } })
  }

  return (
    <div className="page-narrow">
      <h1>Split bills with the people you live with</h1>

      <section className="card">
        <h2>Create a home</h2>
        <form className="inline-form" onSubmit={onCreate}>
          <input
            aria-label="Home name"
            placeholder="Home name, e.g. Flat 4B"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="button" disabled={createHome.isPending || !name.trim()}>
            {createHome.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
        {createHome.isError && <ErrorState message={errorText(createHome.error)} />}
      </section>

      <section className="card">
        <h2>Open a home</h2>
        <form className="inline-form" onSubmit={onOpen}>
          <input
            aria-label="Home id"
            placeholder="Paste a home id"
            value={homeIdInput}
            onChange={(event) => setHomeIdInput(event.target.value)}
          />
          <button type="submit" className="button button-ghost" disabled={!homeIdInput.trim()}>
            Open
          </button>
        </form>
        {recentHomes.length > 0 && (
          <ul className="recent-list">
            {recentHomes.map((home) => (
              <li key={home.id}>
                <Link to="/homes/$homeId" params={{ homeId: home.id }}>
                  {home.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
