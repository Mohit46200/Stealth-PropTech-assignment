import { Hono } from 'hono'
import { type ShareRow, toShare } from '../db'
import { HttpError, MAX_IDEMPOTENCY_KEY_LENGTH } from '../http'

export const bills = new Hono<{ Bindings: Env }>()

const SHARE_COLUMNS = 'id, bill_id, member_id, amount_cents, paid_at, idempotency_key'

bills.post('/:billId/shares/:shareId/pay', async (c) => {
  const { billId, shareId } = c.req.param()
  const key = c.req.header('Idempotency-Key')?.trim()
  if (!key) throw new HttpError(400, 'Idempotency-Key header is required')
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new HttpError(
      400,
      `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
    )
  }

  // Compare-and-set: the share is only updated while it is still unpaid. SQLite runs one write
  // at a time, so when two requests race, exactly one of them gets the row back.
  const paid = await c.env.DB.prepare(
    `UPDATE shares SET paid_at = ?, idempotency_key = ?
     WHERE id = ? AND bill_id = ? AND paid_at IS NULL
     RETURNING ${SHARE_COLUMNS}`,
  )
    .bind(new Date().toISOString(), key, shareId, billId)
    .first<ShareRow>()

  if (paid) return c.json(toShare(paid), 200)

  // Nothing was updated: the share does not exist in this bill, or it is already paid.
  const share = await c.env.DB.prepare(
    `SELECT ${SHARE_COLUMNS} FROM shares WHERE id = ? AND bill_id = ?`,
  )
    .bind(shareId, billId)
    .first<ShareRow>()

  if (!share) {
    const bill = await c.env.DB.prepare('SELECT 1 FROM bills WHERE id = ?').bind(billId).first()
    throw new HttpError(404, bill ? 'Share not found' : 'Bill not found')
  }

  // Same key as the payment that won: a retry, so replay the original result.
  if (share.idempotency_key === key) return c.json(toShare(share), 200)

  throw new HttpError(409, 'Share is already paid')
})
