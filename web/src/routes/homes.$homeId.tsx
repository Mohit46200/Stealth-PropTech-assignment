import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { BalancesPanel } from '../components/BalancesPanel'
import { BillCard } from '../components/BillCard'
import { MembersPanel } from '../components/MembersPanel'
import { NewBillForm } from '../components/NewBillForm'
import { Empty, ErrorState, errorText, Loading } from '../components/StatusViews'
import { ApiError, api, type Member, queryKeys } from '../lib/api'
import { rememberHome } from '../lib/recent-homes'

export const Route = createFileRoute('/homes/$homeId')({
  component: HomePage,
})

function HomePage() {
  const { homeId } = Route.useParams()

  const home = useQuery({
    queryKey: queryKeys.home(homeId),
    queryFn: ({ signal }) => api.getHome(homeId, signal),
    // A missing home will not appear by retrying.
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status === 404) && failures < 2,
  })

  useEffect(() => {
    if (home.data) rememberHome(home.data)
  }, [home.data])

  if (home.isPending) return <Loading label="Loading home…" />
  if (home.isError) {
    const notFound = home.error instanceof ApiError && home.error.status === 404
    return (
      <ErrorState
        message={notFound ? 'This home does not exist.' : errorText(home.error)}
        onRetry={notFound ? undefined : () => home.refetch()}
      />
    )
  }

  const { members } = home.data

  return (
    <div className="home-page">
      <header className="page-header">
        <h1>{home.data.name}</h1>
        <p className="hint">
          Home id: <code>{home.data.id}</code>
        </p>
      </header>
      <div className="layout">
        <div className="column-main">
          <BillsSection homeId={homeId} members={members} />
        </div>
        <aside className="column-side">
          <BalancesPanel homeId={homeId} />
          <NewBillForm homeId={homeId} hasMembers={members.length > 0} />
          <MembersPanel homeId={homeId} members={members} />
        </aside>
      </div>
    </div>
  )
}

function BillsSection({ homeId, members }: { homeId: string; members: Member[] }) {
  const bills = useQuery({
    queryKey: queryKeys.bills(homeId),
    queryFn: ({ signal }) => api.listBills(homeId, signal),
  })

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.name])),
    [members],
  )

  return (
    <section>
      <h2>Bills</h2>
      {bills.isPending ? (
        <Loading label="Loading bills…" />
      ) : bills.isError ? (
        <ErrorState message={errorText(bills.error)} onRetry={() => bills.refetch()} />
      ) : bills.data.bills.length === 0 ? (
        <Empty>No bills yet. Add one to split it between the members.</Empty>
      ) : (
        <div className="bill-list">
          {bills.data.bills.map((bill) => (
            <BillCard key={bill.id} homeId={homeId} bill={bill} memberNames={memberNames} />
          ))}
        </div>
      )}
    </section>
  )
}
