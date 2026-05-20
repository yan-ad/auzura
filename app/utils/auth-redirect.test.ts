import { describe, expect, it } from 'vitest'

import { buildLoginRedirectPath, shouldAutoRedirectToLogin } from './auth-redirect'

describe('auth redirect helpers', () => {
  it('redirects normal app pages to Microsoft login', () => {
    expect(shouldAutoRedirectToLogin('/')).toBe(true)
    expect(shouldAutoRedirectToLogin('/org/project/tasks')).toBe(true)
    expect(shouldAutoRedirectToLogin('/setup')).toBe(true)
  })

  it('does not redirect auth endpoints and static framework assets', () => {
    expect(shouldAutoRedirectToLogin('/api/auth/azure/login')).toBe(false)
    expect(shouldAutoRedirectToLogin('/api/auth/azure/callback')).toBe(false)
    expect(shouldAutoRedirectToLogin('/api/_auth/session')).toBe(false)
    expect(shouldAutoRedirectToLogin('/_nuxt/app.js')).toBe(false)
    expect(shouldAutoRedirectToLogin('/installHook.js.map')).toBe(false)
  })

  it('keeps the attempted page as the login redirect target', () => {
    expect(buildLoginRedirectPath('/org/project/tasks?keyword=%23383')).toBe(
      '/api/auth/azure/login?redirect=%2Forg%2Fproject%2Ftasks%3Fkeyword%3D%2523383',
    )
  })
})
