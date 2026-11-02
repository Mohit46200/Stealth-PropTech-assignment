import { useQuery } from '@tanstack/react-query'
import { api, queryKeys } from '../lib/api'
import { formatCents } from '../lib/money'
import { Empty, ErrorState, errorText, Loading } from './StatusViews'

export function BalancesPanel({ homeId }: { homeId: string }) {
  const balances = useQuery({
    queryKey: queryKeys.balances(homeId),
    queryFn: ({ signal }) => api.getBalances(homeId, signal),
  })

  return (
    <section className="card">
      <h2>Still owed</h2>
      {balances.isPending ? (
        <Loading label="Loading balances…" />
      ) : balances.isError ? (
        <ErrorState message={errorText(balances.error)} onRetry={() => balances.refetch()} />
      ) : balances.data.balances.length === 0 ? (
        <Empty>No members, so nobody owes anything.</Empty>
      ) : (
        <ul className="balance-list">
          {balances.data.balances.map((balance) => (
            <li key={balance.memberId}>
              <span>{balance.name}</span>
              <strong className={balance.outstandingCents === 0 ? 'settled' : undefined}>
                {formatCents(balance.outstandingCents)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
