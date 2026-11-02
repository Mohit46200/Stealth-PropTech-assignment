import { Hono } from 'hono'
import {
  type Balance,
  type BillRow,
  findHome,
  listMembers,
  type MemberRow,
  type Share,
  type ShareRow,
  toBill,
  toHome,
  toMember,
  toShare,
} from '../db'
import { HttpError, readJsonObject, requirePositiveCents, requireText } from '../http'
import { splitCents } from '../split'

export const homes = new Hono<{ Bindings: Env }>()

async function requireHome(db: D1Database, homeId: string) {
  const home = await findHome(db, homeId)
  if (!home) throw new HttpError(404, 'Home not found')
  return home
}

homes.post('/', async (c) => {
  const body = await readJsonObject(c)
  const name = requireText(body.name, 'name')
  const id = crypto.randomUUID()

  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, name, new Date().toISOString())
    .run()

  return c.json(toHome({ id, name }), 201)
})

homes.get('/:homeId', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  const members = await listMembers(c.env.DB, home.id)
  return c.json({ ...toHome(home), members: members.map(toMember) })
})

homes.post('/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const body = await readJsonObject(c)
  const name = requireText(body.name, 'name')
  const id = crypto.randomUUID()

  // One statement checks the home exists and takes the next join position, so two members
  // added at the same time can never get the same position (uq_members_home_position backs this).
  const result = await c.env.DB.prepare(
    `INSERT INTO members (id, home_id, name, position, created_at)
     SELECT ?1, h.id, ?2,
            COALESCE((SELECT MAX(m.position) FROM members m WHERE m.home_id = h.id), 0) + 1,
            ?3
     FROM homes h
     WHERE h.id = ?4`,
  )
    .bind(id, name, new Date().toISOString(), homeId)
    .run()

  if (result.meta.changes === 0) throw new HttpError(404, 'Home not found')

  return c.json(toMember({ id, home_id: homeId, name }), 201)
})

homes.get('/:homeId/bills', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))

  const [bills, shares] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, home_id, title, total_cents FROM bills
       WHERE home_id = ? ORDER BY created_at DESC, rowid DESC`,
    ).bind(home.id),
    c.env.DB.prepare(
      `SELECT s.id, s.bill_id, s.member_id, s.amount_cents, s.paid_at, s.idempotency_key
       FROM shares s
       JOIN bills b ON b.id = s.bill_id
       JOIN members m ON m.id = s.member_id
       WHERE b.home_id = ?
       ORDER BY m.position`,
    ).bind(home.id),
  ])

  const sharesByBill = new Map<string, Share[]>()
  for (const row of (shares?.results ?? []) as ShareRow[]) {
    const list = sharesByBill.get(row.bill_id) ?? []
    list.push(toShare(row))
    sharesByBill.set(row.bill_id, list)
  }

  const billRows = (bills?.results ?? []) as BillRow[]
  return c.json({ bills: billRows.map((bill) => toBill(bill, sharesByBill.get(bill.id) ?? [])) })
})

homes.post('/:homeId/bills', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))
  const body = await readJsonObject(c)
  const title = requireText(body.title, 'title')
  const totalCents = requirePositiveCents(body.totalCents, 'totalCents')

  const members = await listMembers(c.env.DB, home.id)
  if (members.length === 0) {
    throw new HttpError(422, 'Cannot split a bill in a home with no members')
  }

  const billId = crypto.randomUUID()
  const amounts = splitCents(totalCents, members.length)
  const shares: ShareRow[] = members.map((member: MemberRow, index) => ({
    id: crypto.randomUUID(),
    bill_id: billId,
    member_id: member.id,
    amount_cents: amounts[index] ?? 0,
    paid_at: null,
    idempotency_key: null,
  }))

  // D1 runs a batch as one transaction: the bill and all its shares are saved, or none are.
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(billId, home.id, title, totalCents, new Date().toISOString()),
    ...shares.map((share) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
      ).bind(share.id, share.bill_id, share.member_id, share.amount_cents),
    ),
  ])

  const bill: BillRow = { id: billId, home_id: home.id, title, total_cents: totalCents }
  return c.json(toBill(bill, shares.map(toShare)), 201)
})

homes.get('/:homeId/balances', async (c) => {
  const home = await requireHome(c.env.DB, c.req.param('homeId'))

  const { results } = await c.env.DB.prepare(
    `SELECT m.id AS memberId,
            m.name AS name,
            COALESCE(SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents END), 0) AS outstandingCents
     FROM members m
     LEFT JOIN shares s ON s.member_id = m.id
     WHERE m.home_id = ?
     GROUP BY m.id
     ORDER BY m.position`,
  )
    .bind(home.id)
    .all<Balance>()

  return c.json({ balances: results })
})
