/**
 * Database seeding script with sample data for DC-BI
 */

import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { schema, employees, departments, productivity, connections, analyticsPages } from '../schema'

const connectionString = process.env.DATABASE_URL || 'postgresql://dc_bi_user:dc_bi_pass123@localhost:54930/dc_bi_db'

async function seedDatabase() {
  console.log('Seeding DC-BI database...')
  const client = postgres(connectionString)
  const db = drizzle(client, { schema })

  try {
    // Seed departments
    const deptData = [
      { name: 'Engineering', organisationId: 1, budget: 500000 },
      { name: 'Marketing', organisationId: 1, budget: 200000 },
      { name: 'Sales', organisationId: 1, budget: 300000 },
      { name: 'HR', organisationId: 1, budget: 150000 }
    ]
    const depts = await db.insert(departments).values(deptData).returning()
    console.log(`Seeded ${depts.length} departments`)

    // Seed employees
    const employeeData = [
      { name: 'Alice Chen', email: 'alice@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 120000, city: 'San Francisco', region: 'California', country: 'USA' },
      { name: 'Bob Smith', email: 'bob@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 110000, city: 'San Francisco', region: 'California', country: 'USA' },
      { name: 'Carol White', email: 'carol@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 105000, city: 'Portland', region: 'Oregon', country: 'USA' },
      { name: 'Dave Johnson', email: 'dave@example.com', active: true, departmentId: depts[1].id, organisationId: 1, salary: 95000, city: 'New York', region: 'New York', country: 'USA' },
      { name: 'Eve Brown', email: 'eve@example.com', active: true, departmentId: depts[1].id, organisationId: 1, salary: 90000, city: 'New York', region: 'New York', country: 'USA' },
      { name: 'Frank Garcia', email: 'frank@example.com', active: true, departmentId: depts[2].id, organisationId: 1, salary: 100000, city: 'Chicago', region: 'Illinois', country: 'USA' },
      { name: 'Grace Lee', email: 'grace@example.com', active: true, departmentId: depts[2].id, organisationId: 1, salary: 98000, city: 'Chicago', region: 'Illinois', country: 'USA' },
      { name: 'Henry Wilson', email: 'henry@example.com', active: false, departmentId: depts[2].id, organisationId: 1, salary: 85000, city: 'Austin', region: 'Texas', country: 'USA' },
      { name: 'Ivy Taylor', email: 'ivy@example.com', active: true, departmentId: depts[3].id, organisationId: 1, salary: 88000, city: 'Denver', region: 'Colorado', country: 'USA' },
      { name: 'Jack Davis', email: 'jack@example.com', active: true, departmentId: depts[3].id, organisationId: 1, salary: 92000, city: 'Seattle', region: 'Washington', country: 'USA' }
    ]
    const emps = await db.insert(employees).values(employeeData).returning()
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
    await db.insert(productivity).values(prodData)
    console.log(`Seeded ${prodData.length} productivity records`)

    // Seed a default "local" connection entry pointing to this database
    await db.insert(connections).values({
      name: 'Local PostgreSQL (Demo)',
      description: 'Built-in demo database with sample employee data',
      engineType: 'postgres',
      connectionString: connectionString,
      organisationId: 1
    })
    console.log('Seeded default connection')

    // Seed an example dashboard
    await db.insert(analyticsPages).values({
      name: 'Overview Dashboard',
      description: 'Employee and productivity overview',
      config: {
        portlets: [
          {
            id: 'p1',
            title: 'Employees by Department',
            query: JSON.stringify({
              measures: ['Employees.count'],
              dimensions: ['Departments.name']
            }),
            chartType: 'bar',
            w: 6, h: 4, x: 0, y: 0
          },
          {
            id: 'p2',
            title: 'Average Salary',
            query: JSON.stringify({
              measures: ['Employees.avgSalary'],
              dimensions: ['Departments.name']
            }),
            chartType: 'bar',
            w: 6, h: 4, x: 6, y: 0
          },
          {
            id: 'p3',
            title: 'Code Output Over Time',
            query: JSON.stringify({
              measures: ['Productivity.totalLinesOfCode'],
              timeDimensions: [{
                dimension: 'Productivity.date',
                granularity: 'week'
              }]
            }),
            chartType: 'line',
            w: 12, h: 4, x: 0, y: 4
          }
        ],
        filters: []
      },
      organisationId: 1
    })
    console.log('Seeded example dashboard')

    console.log('\nSeeding completed successfully!')
    console.log('\nSeeded data:')
    console.log('- 4 departments')
    console.log(`- ${emps.length} employees`)
    console.log(`- ${prodData.length} productivity records`)
    console.log('- 1 database connection')
    console.log('- 1 example dashboard')

    process.exit(0)
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  }
}

seedDatabase()
