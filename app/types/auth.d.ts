declare module '#auth-utils' {
  interface User {
    displayName?: string
    email?: string
    image?: string
  }

  interface SecureSessionData {
    azureAccessToken?: string
    azureExpiresAt?: number
  }
}

export {}
