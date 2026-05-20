const PUBLIC_AUTH_PATH_PREFIXES = [
  "/api/auth/azure/login",
  "/api/auth/azure/callback",
  "/api/_auth",
  "/_nuxt",
  "/favicon.ico",
  "/robots.txt",
  "/installHook.js.map",
];

export function shouldAutoRedirectToLogin(path: string) {
  if (!path.startsWith("/")) return false;

  return !PUBLIC_AUTH_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function buildLoginRedirectPath(fullPath: string) {
  return `/api/auth/azure/login?redirect=${encodeURIComponent(fullPath || "/")}`;
}
