import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type CheckpointScope = {
  runId: string;
  teamId: string;
  version: number;
};

function parseKey(keyHex: string) {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error("PRESS_AGENT_CHECKPOINT_KEY_INVALID");
  }
  return Buffer.from(keyHex, "hex");
}

function aad(scope: CheckpointScope) {
  return Buffer.from(
    JSON.stringify({
      runId: scope.runId,
      teamId: scope.teamId,
      version: scope.version,
    }),
    "utf8",
  );
}

export function encryptPressAgentCheckpoint(
  plaintext: string,
  keyHex: string,
  scope: CheckpointScope,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseKey(keyHex), iv);
  cipher.setAAD(aad(scope));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPressAgentCheckpoint(
  envelope: string,
  keyHex: string,
  scope: CheckpointScope,
) {
  try {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] =
      envelope.split(".");
    if (
      version !== "v1" ||
      !ivEncoded ||
      !tagEncoded ||
      !ciphertextEncoded ||
      extra
    ) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      parseKey(keyHex),
      Buffer.from(ivEncoded, "base64url"),
    );
    decipher.setAAD(aad(scope));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "PRESS_AGENT_CHECKPOINT_KEY_INVALID"
    ) {
      throw error;
    }
    throw new Error("PRESS_AGENT_CHECKPOINT_DECRYPT_FAILED");
  }
}
