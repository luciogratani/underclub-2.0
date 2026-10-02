import { describe, expect, it } from 'vitest'
import type { PublicEventView } from '@underclub/shared'
import { buildMusicEventJsonLd, nightStartIso } from './eventStructuredData'

describe('nightStartIso', () => {
  it('puts a time after midnight on the next day, Rome offset', () => {
    expect(nightStartIso('2026-12-05', '00:30')).toBe('2026-12-06T00:30:00+01:00')
    expect(nightStartIso('2026-07-04', '00:30')).toBe('2026-07-05T00:30:00+02:00')
  })
  it('keeps an evening time on the date', () => {
    expect(nightStartIso('2026-07-04', '23:30')).toBe('2026-07-04T23:30:00+02:00')
  })
  it('handles the DST nights and month ends', () => {
    // Clocks go back on 2026-10-25 at 03:00: 00:30 is still summer time.
    expect(nightStartIso('2026-10-24', '00:30')).toBe('2026-10-25T00:30:00+02:00')
    // Clocks go forward on 2027-03-28 at 02:00: 00:30 is still winter time.
    expect(nightStartIso('2027-03-27', '00:30')).toBe('2027-03-28T00:30:00+01:00')
    expect(nightStartIso('2026-10-31', '00:30:00')).toBe('2026-11-01T00:30:00+01:00')
  })
})

describe('buildMusicEventJsonLd', () => {
  const event: PublicEventView = {
    id: 'e1',
    title: 'TECHNOROOM',
    date: '2026-12-05',
    time: '00:30:00',
    bookingDeadline: '2026-12-05T17:00:00+00:00',
    lineup: [{ id: 'a1', eventId: 'e1', name: 'DJ ONE', origin: null, sortOrder: 0 }],
    entries: [
      {
        id: 'n1', eventId: 'e1', name: 'RIDOTTO', note: null, quota: 10, sortOrder: 0, price: 10,
        validUntil: null, availability: { soldOut: true, left: 0 },
      },
    ],
  }

  it('describes the night, the club, the lineup and the entries', () => {
    const ld = buildMusicEventJsonLd(event, 'https://underclub.it')
    expect(ld).toMatchObject({
      '@type': 'MusicEvent',
      name: 'TECHNOROOM',
      startDate: '2026-12-06T00:30:00+01:00',
      url: 'https://underclub.it/',
      performer: [{ '@type': 'Person', name: 'DJ ONE' }],
      offers: [{ price: 10, priceCurrency: 'EUR', availability: 'https://schema.org/SoldOut',
        validThrough: '2026-12-05T17:00:00+00:00' }],
    })
  })

  it('leaves out an empty lineup and no entries', () => {
    const ld = buildMusicEventJsonLd({ ...event, lineup: [], entries: [] }, 'https://underclub.it')
    expect(ld).not.toHaveProperty('performer')
    expect(ld).not.toHaveProperty('offers')
  })
})
