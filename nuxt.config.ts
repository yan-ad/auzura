export default defineNuxtConfig({
  compatibilityDate: '2025-11-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/../assets/css/main.css'],
  runtimeConfig: {
    azureDevOpsOrganization: process.env.NUXT_AZURE_DEVOPS_ORGANIZATION || process.env.AZURE_DEVOPS_ORGANIZATION || '',
    azureDevOpsToken: process.env.NUXT_AZURE_DEVOPS_TOKEN || process.env.AZURE_DEVOPS_TOKEN || '',
    public: {
      azureDevOpsOrganization: process.env.NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION || process.env.NUXT_AZURE_DEVOPS_ORGANIZATION || process.env.AZURE_DEVOPS_ORGANIZATION || ''
    }
  },
  future: {
    compatibilityVersion: 4
  }
})
