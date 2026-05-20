import { defineEventHandler, setResponseStatus } from "h3";

const IGNORED_STATIC_ARTIFACTS = new Set(["installHook.js.map"]);

export default defineEventHandler((event) => {
  const pathname = event.path.split("?")[0]?.replace(/^\/+/, "") || "";

  if (!IGNORED_STATIC_ARTIFACTS.has(pathname)) return;

  setResponseStatus(event, 204);
  return "";
});
