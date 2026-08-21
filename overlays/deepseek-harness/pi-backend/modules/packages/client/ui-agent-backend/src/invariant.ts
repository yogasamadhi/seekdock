/** Package-owned invariant companion for the browser-only surface plugin. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@seekdock/dsh-client-ui-agent-backend'

/** Cordis companion plugin name. */
export const name = 'client-ui-agent-backend-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

/** No runtime invariant: durable backend enforcement is owned by the Host. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
