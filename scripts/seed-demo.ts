// Fill a fresh database with fictional demo data — for trying the app, local
// development, and README screenshots.
//
//   DATABASE_URL=file:./data/demo.db bun run seed:demo
//
// Every company is invented and every URL uses the reserved `.example` TLD.
// Refuses to touch a database that already has users or applications.

import { randomBytes } from 'node:crypto'
import { getAdapter } from '../server/lib/db.ts'
import { hashPassword } from '../server/lib/password.ts'
import { createDb } from '../src/storage/sqlite/client.ts'
import { applications, pendingUrls, users } from '../src/storage/sqlite/schema.ts'
import type { ExtractedFields, Status, WorkArrangement } from '../src/types.ts'

const DAY = 24 * 60 * 60 * 1000

// Deterministic PRNG so the demo looks the same on every run (relative to today).
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260912)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

const COMPANIES = [
  'Northwind Labs', 'Lumen Robotics', 'Parcelhop', 'Tessellate', 'Brightpath Health',
  'Quarrylane', 'Heliogrid', 'Fernway', 'Kitebase', 'Orbitpay', 'Maplewire', 'Cobaltforge',
  'Driftwood Studio', 'Saltbox Labs', 'Glasshouse Games', 'Tidewater Systems', 'Marigold Search',
  'Copperline', 'Ember Analytics', 'Nimbus Notes', 'Harborlight Health', 'Vantage Bikes',
  'Pebblestack', 'Wildflower Bio', 'Crescent Ledger', 'Sparrow Logistics', 'Aster Cloud',
  'Riverbend Energy', 'Keystone Learning', 'Mosaic Maps', 'Blue Heron Security', 'Summit Carbon',
  'Quill Legal', 'Fjord Compute', 'Lanternfish', 'Otterbox Audio', 'Plumline Finance',
  'Redwood Relay', 'Starling Travel', 'Thistle Foods', 'Umbra Imaging', 'Verdant Farms',
  'Waypoint Civic', 'Yarrow Health', 'Birchbark Books', 'Cinder Robotics', 'Dovetail Payroll',
  'Eastlake Transit', 'Foxglove Media', 'Granite Peak Labs', 'Hollowtree Games', 'Ironbridge Data',
] as const

const ROLES = [
  'Software Engineer, Platform', 'Senior Frontend Engineer', 'Backend Engineer, Payments',
  'Full-Stack Engineer', 'Product Engineer', 'Infrastructure Engineer', 'Software Engineer, Data',
  'Developer Experience Engineer', 'Senior Software Engineer, Search', 'Mobile Engineer (React Native)',
  'Site Reliability Engineer', 'Software Engineer, Growth',
] as const

const SOURCES = ['Greenhouse', 'Lever', 'LinkedIn', 'Company site', 'Wellfound', 'Ashby'] as const
const LOCATIONS = [
  'Remote (US)', 'New York, NY', 'San Francisco, CA', 'Austin, TX', 'Seattle, WA',
  'Denver, CO', 'Chicago, IL', 'Remote (Americas)', 'Boston, MA',
] as const
const ARRANGEMENTS: WorkArrangement[] = ['remote', 'remote', 'hybrid', 'onsite', 'hybrid']
const SALARIES = [
  '$130k–$160k', '$145k–$175k', '$160k–$195k', '$120k–$150k', '$175k–$210k', '', '$150k + equity',
] as const
const TAGS = ['backend', 'frontend', 'full-stack', 'infra', 'startup', 'series-b', 'referral', 'high-priority', 'stretch'] as const
const NOTES = [
  'Recruiter reached out after the open-source talk.',
  'Take-home due Friday — scope looks like ~4 hours.',
  'Referred by a former teammate. Ask about on-call rotation.',
  'Great eng blog. Team owns the public API.',
  'Hiring manager screen went well; system design next.',
  '',
  '',
] as const

// Roughly the shape of a real search: a long tail of applications, a handful
// of interviews, a couple of offers.
const STATUS_PLAN: Status[] = [
  ...Array<Status>(8).fill('pending'),
  ...Array<Status>(16).fill('applied'),
  ...Array<Status>(9).fill('interview'),
  ...Array<Status>(3).fill('offer'),
  ...Array<Status>(8).fill('rejected'),
]

function slug(company: string): string {
  return company.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')
}

function jobUrl(company: string, role: string): string {
  const path = role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `https://jobs.${slug(company)}.example/${path}`
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Set DATABASE_URL, e.g. DATABASE_URL=file:./data/demo.db bun run seed:demo')
    process.exit(1)
  }

  const adapter = await getAdapter() // creates the file + applies migrations
  if ((await adapter.countUsers()) > 0 || (await adapter.listApplications()).length > 0) {
    console.error(`Refusing to seed ${url}: it already has users or applications.`)
    process.exit(1)
  }

  const { db } = await createDb(url)
  const now = Date.now()
  const startOfToday = new Date(new Date(now).toDateString()).getTime()

  const password = randomBytes(12).toString('base64url')
  const userId = crypto.randomUUID()
  await db.insert(users).values({
    id: userId,
    username: 'demo',
    passwordHash: await hashPassword(password),
    role: 'admin',
    createdAt: now - 80 * DAY,
  })

  const companies = [...COMPANIES]
  const takeCompany = () => companies.splice(Math.floor(rand() * companies.length), 1)[0]
  // Reserve the pending-queue companies first so no company appears twice.
  const pendingCompanies = Array.from({ length: 6 }, takeCompany)

  let recentApplied = 0
  const rows: (typeof applications.$inferInsert)[] = STATUS_PLAN.map((status, i) => {
    const company = takeCompany() ?? `${pick(COMPANIES)} ${i}`
    const role = pick(ROLES)
    // One application sent on each of the last five days (today included) so
    // the streak and "applied today" cards show something; the rest spread
    // over ~10 weeks.
    const recentDay = status === 'applied' && recentApplied < 5 ? recentApplied++ : null
    const daysAgo = recentDay ?? 5 + Math.floor(rand() * 65)
    const hour = recentDay === 0 ? 1 + rand() * 2 : 9 + rand() * 9
    const createdAt = Math.min(startOfToday - daysAgo * DAY + hour * 60 * 60 * 1000, now - 60_000)
    const appliedAt =
      status === 'pending'
        ? null
        : recentDay !== null
          ? createdAt
          : Math.min(createdAt + Math.floor(rand() * 2) * DAY, now - 30_000)
    const tagCount = Math.floor(rand() * 3)
    return {
      id: crypto.randomUUID(),
      url: jobUrl(company, role),
      company,
      role,
      salary: pick(SALARIES),
      location: pick(LOCATIONS),
      workArrangement: pick(ARRANGEMENTS),
      source: pick(SOURCES),
      tags: [...new Set(Array.from({ length: tagCount }, () => pick(TAGS)))],
      status,
      notes: pick(NOTES),
      deadline: status === 'pending' && rand() < 0.5 ? startOfToday + Math.ceil(rand() * 14) * DAY : null,
      followUpDate: status === 'applied' && rand() < 0.4 ? startOfToday + Math.ceil(rand() * 10) * DAY : null,
      appliedAt,
      createdAt,
      addedBy: userId,
      addedByName: 'demo',
    }
  })
  await db.insert(applications).values(rows)

  const pending: (typeof pendingUrls.$inferInsert)[] = pendingCompanies.map((company, i) => {
    const role = pick(ROLES)
    const link = jobUrl(company, role)
    const done = i < 4
    const extracted: ExtractedFields = done
      ? {
          company,
          role,
          salary: pick(SALARIES),
          location: pick(LOCATIONS),
          workArrangement: pick(ARRANGEMENTS),
          source: pick(SOURCES),
        }
      : { company: '', role: '', salary: '', location: '', workArrangement: '', source: '' }
    return {
      id: crypto.randomUUID(),
      url: link,
      hostname: new URL(link).hostname,
      extraction: done ? 'done' : 'idle',
      extracted,
      extractError: '',
      addedBy: userId,
      addedByName: 'demo',
      createdAt: now - i * 45 * 60 * 1000,
    }
  })
  await db.insert(pendingUrls).values(pending)

  console.log(`Seeded ${rows.length} applications and ${pending.length} pending links into ${url}`)
  console.log(`Sign in as  demo / ${password}`)
}

await main()
