/** Node-half and invariant-companion package ownership. */

import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as AgentBackendInvariant from '@seekdock/dsh-client-ui-agent-backend/invariant'
import { describe, expect, it } from 'vitest'

describe('ui-agent-backend invariant companion', () => {
  it('mounts its empty invariant installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(AgentBackendInvariant).await()).resolves.toBeDefined()
  })

  it('keeps an empty node half', async () => {
    const { apply } = await import('@seekdock/dsh-client-ui-agent-backend')
    apply()
    expect(typeof apply).toBe('function')
  })
})
