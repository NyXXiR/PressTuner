import { randomBytes } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";

type Options = {
  envFile: string;
  loginId: string;
  teamSlug: string;
  allowedHost: string;
};

function readOption(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function readOptions(): Options {
  const envFile = resolve(readOption("--env-file") ?? ".env");
  const loginId = readOption("--login-id");
  const teamSlug = readOption("--team-slug");
  const allowedHost = readOption("--allowed-host");
  if (!loginId || !teamSlug || !allowedHost) {
    throw new Error(
      "Usage: npm run qa-auth:configure -- --login-id <id> --team-slug <slug> --allowed-host <host>",
    );
  }
  if (
    allowedHost.includes("://") ||
    allowedHost.includes("/") ||
    allowedHost.includes("\\") ||
    /\s/.test(allowedHost)
  ) {
    throw new Error("--allowed-host must be an exact host without a protocol or path.");
  }
  return { envFile, loginId, teamSlug, allowedHost: allowedHost.toLowerCase() };
}

function upsertEnv(source: string, values: Record<string, string>) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const remaining = new Map(Object.entries(values));
  const updated = lines.map((line) => {
    for (const [key, value] of remaining) {
      if (new RegExp(`^${key}=`).test(line)) {
        remaining.delete(key);
        return `${key}=${value}`;
      }
    }
    return line;
  });
  if (updated.at(-1) === "") updated.pop();
  for (const [key, value] of remaining) updated.push(`${key}=${value}`);
  return `${updated.join("\n")}\n`;
}

async function main() {
  const options = readOptions();
  loadDotEnv({ path: options.envFile, override: false });
  const { prisma } = await import("../lib/prisma");

  try {
    const user = await prisma.user.findUnique({
      where: { loginId: options.loginId },
      select: {
        isActive: true,
        deleteScheduledAt: true,
        memberships: {
          where: { team: { slug: options.teamSlug } },
          select: {
            team: {
              select: {
                membershipStatus: true,
              },
            },
          },
          take: 1,
        },
      },
    });
    if (
      !user ||
      !user.isActive ||
      user.deleteScheduledAt ||
      user.memberships[0]?.team.membershipStatus !== "ACTIVE"
    ) {
      throw new Error("The requested active QA user/team membership does not exist.");
    }

    const source = await readFile(options.envFile, "utf8");
    const secret =
      process.env.AI_QA_AUTH_SECRET?.trim() ||
      randomBytes(48).toString("base64url");
    const next = upsertEnv(source, {
      AI_QA_AUTH_ENABLED: "true",
      AI_QA_AUTH_SECRET: secret,
      AI_QA_AUTH_LOGIN_ID: options.loginId,
      AI_QA_AUTH_TEAM_SLUG: options.teamSlug,
      AI_QA_AUTH_ALLOWED_HOSTS: options.allowedHost,
      AI_QA_AUTH_TICKET_TTL_SECONDS: "120",
      AI_QA_AUTH_SESSION_TTL_SECONDS: "7200",
    });
    const temporary = `${options.envFile}.qa-auth.tmp`;
    await writeFile(temporary, next, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, options.envFile);
    await chmod(options.envFile, 0o600);

    console.log(
      JSON.stringify({
        ok: true,
        enabled: true,
        loginId: options.loginId,
        teamSlug: options.teamSlug,
        allowedHost: options.allowedHost,
        ticketTtlSeconds: 120,
        sessionTtlSeconds: 7200,
        secret: "stored-without-output",
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "QA auth configuration failed.");
  process.exit(1);
});
