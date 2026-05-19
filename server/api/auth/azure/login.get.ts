import { sendRedirect } from 'h3'
import { withQuery } from 'ufo'
import { buildAzureDevOpsOAuthConfig } from '../../../utils/azure-auth'

export default defineEventHandler(async (event) => {
  const config = buildAzureDevOpsOAuthConfig()

  return sendRedirect(event, withQuery(config.authorizationUrl, {
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: config.scope.join(' '),
    state: '/'
  }))
})
