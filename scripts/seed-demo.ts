/**
 * Creates and populates the demo SQLite database with sample data.
 * Can be called from seed.ts or from auto-seed on startup.
 */

import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { departments, employees, prEvents, productivity } from '../schema/demo'
import {
  DEMO_DDL,
  deptData,
  makeEmployeeData,
  makePREventsData,
  makeProductivityData,
} from './demo-data'

export function seedDemo(dbPath: string) {
  console.log(`Creating demo database at ${dbPath}...`)
  mkdirSync('data', { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // Create tables
  sqlite.exec(DEMO_DDL)

  const db = drizzle(sqlite)

  // Seed departments
  const depts = db.insert(departments).values(deptData).returning().all()
  console.log(`Seeded ${depts.length} departments`)

  // Seed employees
  const employeeData = makeEmployeeData(depts.map(d => d.id))
  const emps = db.insert(employees).values(employeeData).returning().all()
  console.log(`Seeded ${emps.length} employees`)

  // Seed productivity data
  const prodData = makeProductivityData(emps)

  // Insert in batches (SQLite has variable limit)
  const BATCH_SIZE = 100
  for (let i = 0; i < prodData.length; i += BATCH_SIZE) {
    db.insert(productivity)
      .values(prodData.slice(i, i + BATCH_SIZE))
      .run()
  }
  console.log(`Seeded ${prodData.length} productivity records`)

  // Seed PR events
  const prEventsData = makePREventsData(emps)
  for (let i = 0; i < prEventsData.length; i += BATCH_SIZE) {
    db.insert(prEvents)
      .values(prEventsData.slice(i, i + BATCH_SIZE))
      .run()
  }
  console.log(`Seeded ${prEventsData.length} PR event records`)

  sqlite.close()
  console.log('Demo database created successfully')
}
