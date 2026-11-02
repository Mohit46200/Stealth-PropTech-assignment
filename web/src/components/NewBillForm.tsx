import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, queryKeys } from '../lib/api'
import { parseDollarsToCents } from '../lib/money'
import { ErrorState, errorText } from './StatusViews'

export function NewBillForm({ homeId, hasMembers }: { homeId: string; hasMembers: boolean }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const createBill = useMutation({
    mutationFn: (input: { title: string; totalCents: number }) =>
      api.createBill(homeId, input.title, input.totalCents),
    onSuccess: () => {
      setTitle('')
      setAmount('')
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.bills(homeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(homeId) }),
      ])
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const totalCents = parseDollarsToCents(amount)
    if (!title.trim()) return setFormError('Give the bill a title.')
    if (totalCents === null) {
      return setFormError('Enter a positive amount with at most 2 decimals, like 12.50.')
    }
    setFormError(null)
    createBill.mutate({ title: title.trim(), totalCents })
  }

  return (
    <section className="card">
      <h2>New bill</h2>
      {!hasMembers && <p className="hint">Add at least one member before adding a bill.</p>}
      <form className="stack-form" onSubmit={onSubmit}>
        <input
          aria-label="Bill title"
          placeholder="Title, e.g. Electricity"
          value={title}
          maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          aria-label="Amount in dollars"
          placeholder="Amount, e.g. 120.50"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button type="submit" className="button" disabled={createBill.isPending || !hasMembers}>
          {createBill.isPending ? 'Splitting…' : 'Split bill'}
        </button>
      </form>
      {formError && <ErrorState message={formError} />}
      {createBill.isError && <ErrorState message={errorText(createBill.error)} />}
    </section>
  )
}
