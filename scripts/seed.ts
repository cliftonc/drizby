/**
 * Database seeding script for Drizby
 * Creates the demo SQLite database and registers it as a connection in the internal DB.
 */

import 'dotenv/config'
import { analyticsPages, connections, cubeDefinitions, schemaFiles } from '../schema'
import { db } from '../src/db/index'
import {
  DEMO_CUBES_SOURCE,
  DEMO_PORTLETS,
  DEMO_SCHEMA_SOURCE,
} from '../src/routes/seed-demo-config'
import { seedDemo } from './seed-demo'

const DEMO_DB_PATH = 'data/demo.sqlite'

async function seedDatabase() {
  console.log('Seeding Drizby database...')

  // Step 1: Create and populate the demo SQLite database
  seedDemo(DEMO_DB_PATH)

  // Step 2: Register it as a connection in the internal DB
  const [demoConnection] = await db
    .insert(connections)
    .values({
      name: 'Demo SQLite',
      description: 'Built-in demo database with sample employee data',
      engineType: 'sqlite',
      connectionString: `file:${DEMO_DB_PATH}`,
      organisationId: 1,
    })
    .returning()
  console.log('Registered demo connection')

  // Step 3: Seed demo schema file
  const [demoSchemaFile] = await db
    .insert(schemaFiles)
    .values({
      name: 'demo-schema.ts',
      sourceCode: DEMO_SCHEMA_SOURCE,
      connectionId: demoConnection.id,
      organisationId: 1,
    })
    .returning()
  console.log('Seeded demo schema file')

  // Step 4: Seed demo cube definitions
  await db.insert(cubeDefinitions).values({
    name: 'Demo Cubes',
    title: 'Employee Analytics Cubes',
    description: 'Employees, Departments, Productivity, and PR Events cubes for the demo dataset',
    sourceCode: DEMO_CUBES_SOURCE,
    schemaFileId: demoSchemaFile.id,
    connectionId: demoConnection.id,
    organisationId: 1,
  })
  console.log('Seeded demo cube definitions')

  // Step 5: Seed an example dashboard
  await db.insert(analyticsPages).values({
    name: 'Overview Dashboard',
    description: 'Employee and productivity overview',
    connectionId: demoConnection.id,
    config: { portlets: DEMO_PORTLETS, filters: [] },
    organisationId: 1,
  })
  console.log('Seeded example dashboard')

  console.log('\nSeeding completed successfully!')
  process.exit(0)
}

seedDatabase().catch(err => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
