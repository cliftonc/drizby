import { AbilityBuilder, type MongoAbility, createMongoAbility } from '@casl/ability'

export type Actions = 'read' | 'create' | 'update' | 'delete' | 'manage'
export type Subjects =
  | 'Connection'
  | 'Schema'
  | 'CubeDefinition'
  | 'Notebook'
  | 'Dashboard'
  | 'AnalyticsPage'
  | 'User'
  | 'Settings'
  | 'all'
export type AppAbility = MongoAbility<[Actions, Subjects]>

type CanFunction = AbilityBuilder<AppAbility>['can']

const rolePermissions: Record<string, (can: CanFunction) => void> = {
  admin: can => {
    can('manage', 'all')
  },
  member: can => {
    can('read', 'Connection')
    // Notebooks & Dashboards: create, read all, update/delete own (enforced at route level)
    can('read', ['Notebook', 'Dashboard', 'AnalyticsPage'])
    can('create', ['Notebook', 'Dashboard', 'AnalyticsPage'])
    can('update', ['Notebook', 'Dashboard', 'AnalyticsPage'])
    can('delete', ['Notebook', 'Dashboard', 'AnalyticsPage'])
    // Schema & CubeDefinitions: read-only for members (admin manages)
    can('read', ['Schema', 'CubeDefinition'])
  },
  user: () => {
    // No permissions - pending approval
  },
}

export function defineAbilitiesFor(role: string): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  const handler = rolePermissions[role]
  if (handler) {
    handler(can)
  }

  return build()
}
