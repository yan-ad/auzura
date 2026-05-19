import { describe, expect, it } from 'vitest'

import nuxtConfig from '../../nuxt.config'

describe('nuxt-auth-utils session config', () => {
  it('maps NUXT_SESSION_PASSWORD into runtimeConfig.session.password', () => {
    expect(nuxtConfig.runtimeConfig?.session?.password).toBe(process.env.NUXT_SESSION_PASSWORD || '')
  })
})
