import { Container, getContainer } from '@cloudflare/containers'

interface Env {
  DRIZBY: DurableObjectNamespace<DrizbyContainer>
  CF_ACCOUNT_ID: string
  CF_API_TOKEN: string
  D1_DATABASE_ID: string
  D1_DEMO_DATABASE_ID: string
}

export class DrizbyContainer extends Container {
  defaultPort = 3461
  sleepAfter = '5m'

  constructor(ctx: any, env: Env) {
    super(ctx, env)
    this.envVars = {
      NODE_ENV: 'production',
      PORT: '3461',
      CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
      CF_API_TOKEN: env.CF_API_TOKEN,
      D1_DATABASE_ID: env.D1_DATABASE_ID,
      D1_DEMO_DATABASE_ID: env.D1_DEMO_DATABASE_ID,
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const container = getContainer(env.DRIZBY, 'main')
    return container.fetch(request)
  },
}
