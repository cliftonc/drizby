/**
 * Default dashboard configuration for the example dashboard
 */

export const productivityDashboardConfig = {
  name: 'Productivity Analytics Dashboard',
  description: 'Employee and productivity analytics overview',
  order: 0,
  config: {
    portlets: [
      {
        id: 'employees-by-dept',
        title: 'Employees by Department',
        query: JSON.stringify(
          {
            measures: ['Employees.count'],
            dimensions: ['Departments.name'],
          },
          null,
          2
        ),
        chartType: 'bar' as const,
        chartConfig: {
          xAxis: ['Departments.name'],
          yAxis: ['Employees.count'],
          series: [],
        },
        displayConfig: { showLegend: false },
        w: 6,
        h: 4,
        x: 0,
        y: 0,
      },
      {
        id: 'avg-salary-dept',
        title: 'Average Salary by Department',
        query: JSON.stringify(
          {
            measures: ['Employees.avgSalary'],
            dimensions: ['Departments.name'],
          },
          null,
          2
        ),
        chartType: 'bar' as const,
        chartConfig: {
          xAxis: ['Departments.name'],
          yAxis: ['Employees.avgSalary'],
          series: [],
        },
        displayConfig: { showLegend: false },
        w: 6,
        h: 4,
        x: 6,
        y: 0,
      },
      {
        id: 'productivity-trends',
        title: 'Code Output Over Time',
        query: JSON.stringify(
          {
            measures: ['Productivity.totalLinesOfCode'],
            timeDimensions: [
              {
                dimension: 'Productivity.date',
                granularity: 'week',
              },
            ],
          },
          null,
          2
        ),
        chartType: 'line' as const,
        chartConfig: {
          xAxis: ['Productivity.date'],
          yAxis: ['Productivity.totalLinesOfCode'],
          series: [],
        },
        displayConfig: { showLegend: false },
        w: 12,
        h: 5,
        x: 0,
        y: 4,
      },
      {
        id: 'happiness-trend',
        title: 'Happiness Index Over Time',
        query: JSON.stringify(
          {
            measures: ['Productivity.avgHappiness'],
            timeDimensions: [
              {
                dimension: 'Productivity.date',
                granularity: 'week',
              },
            ],
          },
          null,
          2
        ),
        chartType: 'area' as const,
        chartConfig: {
          xAxis: ['Productivity.date'],
          yAxis: ['Productivity.avgHappiness'],
          series: [],
        },
        displayConfig: { showLegend: false },
        w: 6,
        h: 5,
        x: 0,
        y: 9,
      },
      {
        id: 'pull-requests',
        title: 'Pull Requests by Department',
        query: JSON.stringify(
          {
            measures: ['Productivity.totalPullRequests'],
            dimensions: ['Departments.name'],
            cubes: ['Productivity', 'Employees', 'Departments'],
          },
          null,
          2
        ),
        chartType: 'bar' as const,
        chartConfig: {
          xAxis: ['Departments.name'],
          yAxis: ['Productivity.totalPullRequests'],
          series: [],
        },
        displayConfig: { showLegend: false },
        w: 6,
        h: 5,
        x: 6,
        y: 9,
      },
      {
        id: 'productivity-table',
        title: 'Employee Productivity Summary',
        query: JSON.stringify(
          {
            dimensions: ['Employees.name', 'Departments.name'],
            cubes: ['Productivity', 'Employees', 'Departments'],
            measures: [
              'Productivity.totalLinesOfCode',
              'Productivity.totalPullRequests',
              'Productivity.avgHappiness',
            ],
            order: { 'Productivity.totalLinesOfCode': 'desc' },
            limit: 10,
          },
          null,
          2
        ),
        chartType: 'table' as const,
        chartConfig: {},
        displayConfig: {},
        w: 12,
        h: 6,
        x: 0,
        y: 14,
      },
    ],
  },
}
