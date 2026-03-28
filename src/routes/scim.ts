/**
 * SCIM 2.0 provisioning routes
 * Uses scimmy + scimmy-hono-routers to provide standard SCIM endpoints
 * for IdP-driven user and group provisioning.
 */

import { SCIMMY, scimmyHono } from 'scimmy-hono-routers'
import { db } from '../db/index'
import {
  groupDegress,
  groupEgress,
  groupIngress,
  userDegress,
  userEgress,
  userIngress,
  validateScimToken,
} from '../services/scim'

// ---------------------------------------------------------------------------
// Declare SCIM resources with Drizby DB callbacks
// ---------------------------------------------------------------------------

SCIMMY.Resources.declare(SCIMMY.Resources.User)
  .ingress(userIngress as any)
  .egress(userEgress as any)
  .degress(userDegress as any)

SCIMMY.Resources.declare(SCIMMY.Resources.Group)
  .ingress(groupIngress as any)
  .egress(groupEgress as any)
  .degress(groupDegress as any)

// ---------------------------------------------------------------------------
// Create Hono app with SCIM endpoints
// ---------------------------------------------------------------------------

const scimApp = scimmyHono({
  type: 'bearer',
  handler: async c => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Missing or invalid Authorization header')
    }

    const token = authHeader.slice(7)
    const isValid = await validateScimToken(db, token, 1)
    if (!isValid) {
      throw new Error('Invalid SCIM token')
    }

    // Return a synthetic user ID for the /Me endpoint (not meaningful for SCIM tokens)
    return 'scim-service-account'
  },
  context: async () => ({
    db,
    organisationId: 1,
  }),
})

export default scimApp
