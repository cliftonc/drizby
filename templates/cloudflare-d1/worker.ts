import { Container, getContainer } from '@cloudflare/containers'

export class DrizbyContainer extends Container {
  defaultPort = 3461
  sleepAfter = '5m'
}

export default {
  async fetch(request: Request, env: any) {
    const container = getContainer(env.DRIZBY, 'main')
    return container.fetch(request)
  },
}
