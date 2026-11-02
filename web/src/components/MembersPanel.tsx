import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, type Member, queryKeys } from '../lib/api'
import { Empty, ErrorState, errorText } from './StatusViews'

export function MembersPanel({ homeId, members }: { homeId: string; members: Member[] }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const addMember = useMutation({
    mutationFn: (memberName: string) => api.addMember(homeId, memberName),
    onSuccess: () => {
      setName('')
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.home(homeId), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(homeId) }),
      ])
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (name.trim()) addMember.mutate(name.trim())
  }

  return (
    <section className="card">
      <h2>Members</h2>
      {members.length === 0 ? (
        <Empty>No members yet. Add the people who share this home.</Empty>
      ) : (
        <ol className="member-list">
          {members.map((member) => (
            <li key={member.id}>{member.name}</li>
          ))}
        </ol>
      )}
      <form className="inline-form" onSubmit={onSubmit}>
        <input
          aria-label="Member name"
          placeholder="Member name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="button" disabled={addMember.isPending || !name.trim()}>
          {addMember.isPending ? 'Adding…' : 'Add member'}
        </button>
      </form>
      {addMember.isError && <ErrorState message={errorText(addMember.error)} />}
    </section>
  )
}
