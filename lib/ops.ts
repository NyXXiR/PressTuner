type OpsEventInput = {
  event: string;
  userId?: string | null;
  sessionId?: string | null;
  properties?: Record<string, unknown>;
};

const OPS_SERVICE = "presstuner";

export async function trackOpsEvent(input: OpsEventInput) {
  const endpoint = process.env.OPS_CONSOLE_URL?.trim();
  if (!endpoint) return;

  try {
    await fetch(`${endpoint.replace(/\/$/, "")}/api/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        events: [
          {
            service: OPS_SERVICE,
            event: input.event,
            userId: input.userId ?? undefined,
            sessionId: input.sessionId ?? undefined,
            occurredAt: new Date().toISOString(),
            properties: input.properties ?? {},
          },
        ],
      }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[ops] failed to send event", error);
  }
}
