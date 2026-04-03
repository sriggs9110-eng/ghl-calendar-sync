import { createHmac } from "crypto";

export function validateWebhook(
  body: string,
  signature: string | null
): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;

  // If no secret configured, skip validation
  if (!secret) {
    return true;
  }

  if (!signature) {
    console.warn("Webhook secret is set but no signature provided in request");
    return false;
  }

  const hash = createHmac("sha256", secret).update(body).digest("hex");
  return hash === signature;
}
