import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  compatibilityDate: "2025-11-01",
  devtools: { enabled: false },
  modules: ["@nuxt/ui", "nuxt-auth-utils", "@pinia/nuxt"],
  css: ["~/../assets/css/main.css"],
  runtimeConfig: {
    azureTenantId:
      process.env.NUXT_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "",
    azureClientId:
      process.env.NUXT_AZURE_CLIENT_ID || process.env.AZURE_CLIENT_ID || "",
    azureClientSecret:
      process.env.NUXT_AZURE_CLIENT_SECRET ||
      process.env.AZURE_CLIENT_SECRET ||
      "",
    azureRedirectUri:
      process.env.NUXT_AZURE_REDIRECT_URI ||
      process.env.AZURE_REDIRECT_URI ||
      "https://auzura.vercel.app/api/auth/azure/callback",
    mongodbUri: process.env.MONGODB_URI || "",
    mongodbDb: process.env.MONGODB_DB || "auzura",
    azureDevOpsWebhookSecret:
      process.env.NUXT_AZURE_DEVOPS_WEBHOOK_SECRET ||
      process.env.AZURE_DEVOPS_WEBHOOK_SECRET ||
      "",
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || "",
    },
  },
  future: {
    compatibilityVersion: 4,
  },
});
