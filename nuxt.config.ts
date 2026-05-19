export default defineNuxtConfig({
  compatibilityDate: '2025-11-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/../assets/css/main.css'],
  runtimeConfig: {
    azureDevOpsToken: '',
    public: {
      azureDevOpsOrganization: '',
      azureDevOpsProject: ''
    }
  },
  future: {
    compatibilityVersion: 4
  }
})
