import { describe, expect, it } from "vitest";
import { buildAzureWebhookCallbackUrl, parseAzureServiceHookPayload, verifyAzureWebhookSignature } from "./azure-webhooks";
import { createHmac } from "node:crypto";

describe("buildAzureWebhookCallbackUrl", () => {
  it("builds a project scoped work item receiver endpoint", () => {
    expect(buildAzureWebhookCallbackUrl("https://auzura.vercel.app/", "Org One", "Project X")).toBe(
      "https://auzura.vercel.app/api/azure/webhooks/work-item/Org%20One/Project%20X",
    );
  });
});

describe("verifyAzureWebhookSignature", () => {
  it("accepts sha256 HMAC signatures", () => {
    const body = JSON.stringify({ eventType: "workitem.updated" });
    const secret = "secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    expect(
      verifyAzureWebhookSignature({
        body,
        secret,
        headers: new Headers({ "x-azuredevops-signature": `sha256=${signature}` }),
      }),
    ).toBe(true);
  });

  it("rejects bad signatures", () => {
    expect(
      verifyAzureWebhookSignature({
        body: "{}",
        secret: "secret",
        headers: new Headers({ "x-azuredevops-signature": "sha256=deadbeef" }),
      }),
    ).toBe(false);
  });
});

describe("parseAzureServiceHookPayload", () => {
  it("keeps Azure DevOps work item event fields", () => {
    const payload = parseAzureServiceHookPayload({
      eventType: "workitem.updated",
      resource: { id: 383, project: { name: "Auzura" } },
    });

    expect(payload.eventType).toBe("workitem.updated");
    expect(payload.resource?.id).toBe(383);
  });
});
