// Row shapes as stored in D1, and how they map to the JSON the API returns.

export type HomeRow = { id: string; name: string }
export type MemberRow = { id: string; home_id: string; name: string }
export type BillRow = { id: string; home_id: string; title: string; total_cents: number }
export type ShareRow = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

export type Home = { id: string; name: string }
export type Member = { id: string; homeId: string; name: string }
export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}
export type Balance = { memberId: string; name: string; outstandingCents: number }

export const toHome = (row: HomeRow): Home => ({ id: row.id, name: row.name })

export const toMember = (row: MemberRow): Member => ({
  id: row.id,
  homeId: row.home_id,
  name: row.name,
})

export const toShare = (row: ShareRow): Share => ({
  id: row.id,
  memberId: row.member_id,
  amountCents: row.amount_cents,
  paidAt: row.paid_at,
})

export const toBill = (row: BillRow, shares: Share[]): Bill => ({
  id: row.id,
  homeId: row.home_id,
  title: row.title,
  totalCents: row.total_cents,
  shares,
})

export async function findHome(db: D1Database, homeId: string): Promise<HomeRow | null> {
  return db.prepare('SELECT id, name FROM homes WHERE id = ?').bind(homeId).first<HomeRow>()
}

/** Members of a home in the order they joined. */
export async function listMembers(db: D1Database, homeId: string): Promise<MemberRow[]> {
  const { results } = await db
    .prepare('SELECT id, home_id, name FROM members WHERE home_id = ? ORDER BY position')
    .bind(homeId)
    .all<MemberRow>()
  return results
}
