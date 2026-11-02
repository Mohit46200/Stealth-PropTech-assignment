import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { type Balance, type Bill, call, createBill, createHome, type Share } from './helpers'

function pay(billId: string, shareId: string, key: string) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: { 'Idempotency-Key': key },
  })
}

describe('input validation', () => {
  it.each([{}, { name: '' }, { name: '   ' }, { name: 42 }, { name: 'x'.repeat(101) }])(
    'rejects the home body %j with 422',
    async (body) => {
      const home = await call<{ error: string }>('POST', '/api/homes', { body })
      expect(home.status).toBe(422)
      expect(home.body.error).toEqual(expect.any(String))
    },
  )

  it('rejects a body that is not JSON with 400', async () => {
    const response = await exports.default.fetch(
      new Request('http://localhost/api/homes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: expect.any(String) })
  })

  it('rejects a bill without a title', async () => {
    const { homeId } = await createHome(['Asha'])
    const bill = await call('POST', `/api/homes/${homeId}/bills`, { body: { totalCents: 100 } })
    expect(bill.status).toBe(422)
  })

  it('answers unknown routes with JSON', async () => {
    const response = await call<{ error: string }>('GET', '/api/nope')
    expect(response.status).toBe(404)
    expect(response.body.error).toEqual(expect.any(String))
  })
})

describe('bills', () => {
  it('lists the bills of a home with their shares in member order', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben', 'Chitra'])
    await createBill(homeId, 1000)

    const list = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)

    expect(list.status).toBe(200)
    expect(list.body.bills).toHaveLength(1)
    expect(list.body.bills[0]?.shares.map((share) => share.memberId)).toEqual(
      members.map((member) => member.id),
    )
  })

  it('gives a zero-cent share when the total is smaller than the member count', async () => {
    const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])
    const bill = await createBill(homeId, 2)
    expect(bill.body.shares.map((share) => share.amountCents)).toEqual([1, 1, 0])
  })
})

describe('paying under concurrency', () => {
  it('lets only one of two different keys pay the same share at the same time', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    if (!share) throw new Error('bill has no shares')

    const results = await Promise.all([
      pay(bill.body.id, share.id, crypto.randomUUID()),
      pay(bill.body.id, share.id, crypto.randomUUID()),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 500])
  })

  it('answers 200 with the same result to two concurrent requests with the same key', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    if (!share) throw new Error('bill has no shares')
    const key = crypto.randomUUID()

    const [first, second] = await Promise.all([
      pay(bill.body.id, share.id, key),
      pay(bill.body.id, share.id, key),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
  })

  it('does not pay a share through a different bill id', async () => {
    const { homeId } = await createHome(['Asha'])
    const first = await createBill(homeId, 100)
    const second = await createBill(homeId, 200)
    const share = first.body.shares[0]
    if (!share) throw new Error('bill has no shares')

    const paid = await pay(second.body.id, share.id, crypto.randomUUID())

    expect(paid.status).toBe(404)
  })
})
