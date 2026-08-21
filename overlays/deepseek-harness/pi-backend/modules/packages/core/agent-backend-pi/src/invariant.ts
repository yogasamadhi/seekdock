/** Package-owned invariant companion for the Pi Agent backend. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@seekdock/dsh-agent-backend-pi'

export const name = 'agent-backend-pi-invariant'
export const inject = ['invariants']

/** No independent state: the agent-loop registry owns the backend contribution. */
// No runtime invariant: agent-loop owns request reconstruction for every backend.
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
