/**
 * Shared demo data arrays used by both the local seed script and D1 auto-seed.
 */

export const DEMO_DDL = `
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  organisation_id INTEGER NOT NULL,
  budget REAL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  active INTEGER DEFAULT 1,
  department_id INTEGER,
  organisation_id INTEGER NOT NULL,
  salary REAL,
  city TEXT,
  region TEXT,
  country TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS productivity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  department_id INTEGER,
  date INTEGER NOT NULL,
  lines_of_code INTEGER DEFAULT 0,
  pull_requests INTEGER DEFAULT 0,
  happiness_index INTEGER,
  organisation_id INTEGER NOT NULL,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(organisation_id);
CREATE INDEX IF NOT EXISTS idx_employees_org_created ON employees(organisation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organisation_id);
CREATE INDEX IF NOT EXISTS idx_productivity_org ON productivity(organisation_id);
CREATE INDEX IF NOT EXISTS idx_productivity_org_date ON productivity(organisation_id, date);

CREATE TABLE IF NOT EXISTS pr_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  organisation_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pr_events_org ON pr_events(organisation_id);
CREATE INDEX IF NOT EXISTS idx_pr_events_flow ON pr_events(organisation_id, pr_number, timestamp);
CREATE INDEX IF NOT EXISTS idx_pr_events_type ON pr_events(organisation_id, event_type, timestamp, pr_number);
`

export const deptData = [
  { name: 'Engineering', organisationId: 1, budget: 500000 },
  { name: 'Marketing', organisationId: 1, budget: 200000 },
  { name: 'Sales', organisationId: 1, budget: 300000 },
  { name: 'HR', organisationId: 1, budget: 150000 },
]

export function makeEmployeeData(deptIds: number[]) {
  const now = Date.now()
  return [
    {
      name: 'Alice Chen',
      email: 'alice@example.com',
      active: true,
      departmentId: deptIds[0],
      organisationId: 1,
      salary: 120000,
      city: 'San Francisco',
      region: 'California',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Bob Smith',
      email: 'bob@example.com',
      active: true,
      departmentId: deptIds[0],
      organisationId: 1,
      salary: 110000,
      city: 'San Francisco',
      region: 'California',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Carol White',
      email: 'carol@example.com',
      active: true,
      departmentId: deptIds[0],
      organisationId: 1,
      salary: 105000,
      city: 'Portland',
      region: 'Oregon',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Dave Johnson',
      email: 'dave@example.com',
      active: true,
      departmentId: deptIds[1],
      organisationId: 1,
      salary: 95000,
      city: 'New York',
      region: 'New York',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Eve Brown',
      email: 'eve@example.com',
      active: true,
      departmentId: deptIds[1],
      organisationId: 1,
      salary: 90000,
      city: 'New York',
      region: 'New York',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Frank Garcia',
      email: 'frank@example.com',
      active: true,
      departmentId: deptIds[2],
      organisationId: 1,
      salary: 100000,
      city: 'Chicago',
      region: 'Illinois',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Grace Lee',
      email: 'grace@example.com',
      active: true,
      departmentId: deptIds[2],
      organisationId: 1,
      salary: 98000,
      city: 'Chicago',
      region: 'Illinois',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Henry Wilson',
      email: 'henry@example.com',
      active: false,
      departmentId: deptIds[2],
      organisationId: 1,
      salary: 85000,
      city: 'Austin',
      region: 'Texas',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Ivy Taylor',
      email: 'ivy@example.com',
      active: true,
      departmentId: deptIds[3],
      organisationId: 1,
      salary: 88000,
      city: 'Denver',
      region: 'Colorado',
      country: 'USA',
      createdAt: new Date(now),
    },
    {
      name: 'Jack Davis',
      email: 'jack@example.com',
      active: true,
      departmentId: deptIds[3],
      organisationId: 1,
      salary: 92000,
      city: 'Seattle',
      region: 'Washington',
      country: 'USA',
      createdAt: new Date(now),
    },
  ]
}

export function makeProductivityData(emps: Array<{ id: number; departmentId: number | null }>) {
  const prodData: Array<{
    employeeId: number
    departmentId: number | null
    date: Date
    linesOfCode: number
    pullRequests: number
    happinessIndex: number
    organisationId: number
  }> = []
  const startDate = new Date('2024-10-01')

  for (const emp of emps) {
    for (let day = 0; day < 90; day++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + day)

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue

      prodData.push({
        employeeId: emp.id,
        departmentId: emp.departmentId,
        date,
        linesOfCode: Math.floor(Math.random() * 300) + 50,
        pullRequests: Math.floor(Math.random() * 4),
        happinessIndex: Math.floor(Math.random() * 5) + 5,
        organisationId: 1,
      })
    }
  }

  return prodData
}

/**
 * Generate ~200 PRs with realistic lifecycle event sequences.
 * Uses seeded pseudo-random for deterministic output.
 */
export function makePREventsData(emps: Array<{ id: number }>) {
  // Simple seeded PRNG (mulberry32)
  let seed = 42
  const rand = () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const events: Array<{
    prNumber: number
    eventType: string
    employeeId: number
    organisationId: number
    timestamp: Date
  }> = []

  const startDate = new Date('2024-10-01').getTime()
  const totalPRs = 200

  for (let pr = 1; pr <= totalPRs; pr++) {
    // Space PRs ~0.5 days apart
    const prStart = startDate + (pr - 1) * 12 * 60 * 60 * 1000
    let ts = prStart

    // Pick random author; reviewer must be different
    const authorIdx = Math.floor(rand() * emps.length)
    let reviewerIdx = Math.floor(rand() * emps.length)
    if (reviewerIdx === authorIdx) reviewerIdx = (reviewerIdx + 1) % emps.length
    const authorId = emps[authorIdx].id
    const reviewerId = emps[reviewerIdx].id

    const addEvent = (type: string, who: number) => {
      // 1-12 hours between events
      ts += (1 + rand() * 11) * 60 * 60 * 1000
      events.push({
        prNumber: pr,
        eventType: type,
        employeeId: who,
        organisationId: 1,
        timestamp: new Date(ts),
      })
    }

    // All PRs start with "created"
    events.push({
      prNumber: pr,
      eventType: 'created',
      employeeId: authorId,
      organisationId: 1,
      timestamp: new Date(prStart),
    })

    const r = rand()

    if (r < 0.05) {
      // ~10 PRs: stall after creation (no further events)
      continue
    }

    addEvent('review_requested', authorId)

    if (r < 0.15) {
      // ~20 PRs: closed without merge
      addEvent('reviewed', reviewerId)
      addEvent('closed', authorId)
      continue
    }

    if (r < 0.30) {
      // ~30 PRs: changes_requested → re-reviewed → approved → merged
      addEvent('reviewed', reviewerId)
      addEvent('changes_requested', reviewerId)
      addEvent('reviewed', reviewerId)
      addEvent('approved', reviewerId)
      addEvent('merged', authorId)
      continue
    }

    // ~140 PRs: straight path → reviewed → approved → merged
    addEvent('reviewed', reviewerId)
    addEvent('approved', reviewerId)
    addEvent('merged', authorId)
  }

  return events
}
