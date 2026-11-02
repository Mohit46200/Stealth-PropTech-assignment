import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { ApiError, api, type Bill, queryKeys, type Share } from '../lib/api'
import { formatCents } from '../lib/money'
import { ErrorState, errorText } from './StatusViews'

type Props = { homeId: string; bill: Bill; memberNames: Map<string, string> }

export function BillCard({ homeId, bill, memberNames }: Props) {
  const paidCount = bill.shares.filter((share) => share.paidAt !== null).length

  return (
    <article className="card bill">
      <header className="bill-header">
        <h3>{bill.title}</h3>
        <span className="bill-total">{formatCents(bill.totalCents)}</span>
      </header>
      <p className="hint">
        {paidCount} of {bill.shares.length} shares paid
      </p>
      <ul className="share-list">
        {bill.shares.map((share) => (
          <ShareItem
            key={share.id}
            homeId={homeId}
            billId={bill.id}
            share={share}
            memberName={memberNames.get(share.memberId) ?? 'Unknown member'}
          />
        ))}
      </ul>
    </article>
  )
}

type ShareItemProps = { homeId: string; billId: string; share: Share; memberName: string }

function ShareItem({ homeId, billId, share, memberName }: ShareItemProps) {
  const queryClient = useQueryClient()
  // One key per payment attempt. If the request fails without a clear answer (timeout, 500),
  // the retry reuses the key, so the server can never charge the share twice.
  const idempotencyKey = useRef<string | null>(null)

  const pay = useMutation({
    mutationFn: () => {
      idempotencyKey.current ??= crypto.randomUUID()
      return api.payShare(billId, share.id, idempotencyKey.current)
    },
    onSuccess: (paid) => {
      idempotencyKey.current = null
      queryClient.setQueryData<{ bills: Bill[] }>(queryKeys.bills(homeId), (data) =>
        data ? { bills: data.bills.map((bill) => withPaidShare(bill, paid)) } : data,
      )
    },
    onError: (error) => {
      // 404 and 409 are final answers: the next click is a new attempt with a new key.
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        idempotencyKey.current = null
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.bills(homeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(homeId) }),
      ]),
  })

  const isPaid = share.paidAt !== null

  return (
    <li className={`share ${isPaid ? 'share-paid' : ''}`}>
      <div className="share-main">
        <span className="share-member">{memberName}</span>
        <span className="share-amount">{formatCents(share.amountCents)}</span>
        {isPaid ? (
          <span className="badge" title={share.paidAt ?? undefined}>
            Paid {formatPaidAt(share.paidAt)}
          </span>
        ) : (
          <button
            type="button"
            className="button button-small"
            disabled={pay.isPending}
            onClick={() => pay.mutate()}
          >
            {pay.isPending ? 'Paying…' : pay.isError ? 'Retry payment' : 'Pay'}
          </button>
        )}
      </div>
      {pay.isError && (!isPaid || isConflict(pay.error)) && (
        <ErrorState message={paymentErrorText(pay.error)} />
      )}
    </li>
  )
}

function withPaidShare(bill: Bill, paid: Share): Bill {
  return {
    ...bill,
    shares: bill.shares.map((share) => (share.id === paid.id ? paid : share)),
  }
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

function paymentErrorText(error: unknown): string {
  if (isConflict(error)) {
    return 'Someone else already paid this share.'
  }
  return `Payment failed: ${errorText(error)}`
}

function formatPaidAt(paidAt: string | null): string {
  if (!paidAt) return ''
  const date = new Date(paidAt)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}
