import {
  buildLoginRedirectPath,
  shouldAutoRedirectToLogin,
} from "~/utils/auth-redirect";

export default defineNuxtRouteMiddleware(async (to) => {
  if (!import.meta.client) return;
  if (!shouldAutoRedirectToLogin(to.path)) return;

  const { fetch, loggedIn, ready } = useUserSession();

  if (!ready.value) {
    await fetch();
  }

  if (loggedIn.value) return;

  return navigateTo(buildLoginRedirectPath(to.fullPath), { external: true });
});
