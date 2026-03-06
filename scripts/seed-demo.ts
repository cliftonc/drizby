/**
 * Creates and populates the demo SQLite database with sample data.
 * Can be called from seed.ts or from auto-seed on startup.
 */

import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { employees, departments, productivity } from '../schema/demo'

export function seedDemo(dbPath: string) {
  console.log(`Creating demo database at ${dbPath}...`)
  mkdirSync('data', { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // Create tables
  sqlite.exec(`
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
  `)

  const db = drizzle(sqlite)

  // Seed departments
  const deptData = [
    { name: 'Engineering', organisationId: 1, budget: 500000 },
    { name: 'Marketing', organisationId: 1, budget: 200000 },
    { name: 'Sales', organisationId: 1, budget: 300000 },
    { name: 'HR', organisationId: 1, budget: 150000 }
  ]
  const depts = db.insert(departments).values(deptData).returning().all()
  console.log(`Seeded ${depts.length} departments`)

  // Seed employees
  const now = Date.now()
  const employeeData = [
    { name: 'Alice Chen', email: 'alice@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 120000, city: 'San Francisco', region: 'California', country: 'USA', createdAt: new Date(now) },
    { name: 'Bob Smith', email: 'bob@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 110000, city: 'San Francisco', region: 'California', country: 'USA', createdAt: new Date(now) },
    { name: 'Carol White', email: 'carol@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 105000, city: 'Portland', region: 'Oregon', country: 'USA', createdAt: new Date(now) },
    { name: 'Dave Johnson', email: 'dave@example.com', active: true, departmentId: depts[1].id, organisationId: 1, salary: 95000, city: 'New York', region: 'New York', country: 'USA', createdAt: new Date(now) },
    { name: 'Eve Brown', email: 'eve@example.com', active: true, departmentId: depts[1].id, organisationId: 1, salary: 90000, city: 'New York', region: 'New York', country: 'USA', createdAt: new Date(now) },
    { name: 'Frank Garcia', email: 'frank@example.com', active: true, departmentId: depts[2].id, organisationId: 1, salary: 100000, city: 'Chicago', region: 'Illinois', country: 'USA', createdAt: new Date(now) },
    { name: 'Grace Lee', email: 'grace@example.com', active: true, departmentId: depts[2].id, organisationId: 1, salary: 98000, city: 'Chicago', region: 'Illinois', country: 'USA', createdAt: new Date(now) },
    { name: 'Henry Wilson', email: 'henry@example.com', active: false, departmentId: depts[2].id, organisationId: 1, salary: 85000, city: 'Austin', region: 'Texas', country: 'USA', createdAt: new Date(now) },
    { name: 'Ivy Taylor', email: 'ivy@example.com', active: true, departmentId: depts[3].id, organisationId: 1, salary: 88000, city: 'Denver', region: 'Colorado', country: 'USA', createdAt: new Date(now) },
    { name: 'Jack Davis', email: 'jack@example.com', active: true, departmentId: depts[3].id, organisationId: 1, salary: 92000, city: 'Seattle', region: 'Washington', country: 'USA', createdAt: new Date(now) }
  ]
  const emps = db.insert(employees).values(employeeData).returning().all()
  console.log(`Seeded ${emps.length} employees`)

  // Seed productivity data (3 months of daily data for each employee)
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
        organisationId: 1
      })
    }
  }

  // Insert in batches (SQLite has variable limit)
  const BATCH_SIZE = 100
  for (let i = 0; i < prodData.length; i += BATCH_SIZE) {
    db.insert(productivity).values(prodData.slice(i, i + BATCH_SIZE)).run()
  }
  console.log(`Seeded ${prodData.length} productivity records`)

  sqlite.close()
  console.log('Demo database created successfully')
}
