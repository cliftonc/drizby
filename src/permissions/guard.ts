import type { Context } from 'hono'
import type { Actions, AppAbility, Subjects } from './abilities'

export function guardPermission(c: Context, action: Actions, subject: Subjects): Response | null {
  const ability = c.get('ability') as AppAbility | undefined
  if (!ability || !ability.can(action, subject)) {
    return c.json({ error: 'Forbidden' }, 403) as unknown as Response
  }
  return null
}
