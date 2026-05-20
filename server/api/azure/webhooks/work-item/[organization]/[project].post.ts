import { getRouterParam, readRawBody } from "h3";
import { receiveAzureWorkItemWebhook } from "../../../../../utils/azure-webhooks";

export default defineEventHandler(async (event) => {
  const organization = getRouterParam(event, "organization");
  const project = getRouterParam(event, "project");
  const body = (await readRawBody(event, "utf8")) || "{}";

  return await receiveAzureWorkItemWebhook({
    organization,
    project,
    body,
    headers: event.node.req.headers,
  });
});
