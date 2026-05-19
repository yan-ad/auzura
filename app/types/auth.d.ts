declare module '#auth-utils' {
  interface User {
    displayName?: string
    email?: string
  }

  interface SecureSessionData {
    azureAccessToken?: string
    azureRefreshToken?: string
    azureExpiresAt?: number
  }
}

export {}
