export type JsonSnapshot =
  | null
  | boolean
  | number
  | string
  | JsonSnapshot[]
  | { [key: string]: JsonSnapshot };

export type SnapshotDiff = {
  path: string;
  kind: "added" | "removed" | "changed";
  before: JsonSnapshot | undefined;
  after: JsonSnapshot | undefined;
};

export function cloneJsonSnapshot(value: unknown): JsonSnapshot {
  const serialized = JSON.stringify(value, (_key, current) =>
    typeof current === "bigint" ? current.toString() : current,
  );
  return serialized === undefined ? null : (JSON.parse(serialized) as JsonSnapshot);
}
function same(left: JsonSnapshot, right: JsonSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function childPath(parent: string, key: string | number, array: boolean) {
  if (array) return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : String(key);
}

export function diffJsonSnapshots(
  beforeInput: unknown,
  afterInput: unknown,
): SnapshotDiff[] {
  const before = cloneJsonSnapshot(beforeInput);
  const after = cloneJsonSnapshot(afterInput);
  const changes: SnapshotDiff[] = [];

  function visit(
    left: JsonSnapshot | undefined,
    right: JsonSnapshot | undefined,
    path: string,
    leftExists = true,
    rightExists = true,
  ) {
    if (!leftExists) {
      changes.push({ path, kind: "added", before: undefined, after: right });
      return;
    }
    if (!rightExists) {
      changes.push({ path, kind: "removed", before: left, after: undefined });
      return;
    }
    if (same(left as JsonSnapshot, right as JsonSnapshot)) return;

    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        visit(
          left[index],
          right[index],
          childPath(path, index, true),
          index < left.length,
          index < right.length,
        );
      }
      return;
    }

    const leftObject =
      left !== null && typeof left === "object" && !Array.isArray(left);
    const rightObject =
      right !== null && typeof right === "object" && !Array.isArray(right);
    if (leftObject && rightObject) {
      const leftRecord = left as Record<string, JsonSnapshot>;
      const rightRecord = right as Record<string, JsonSnapshot>;
      const keys = [...new Set([
        ...Object.keys(leftRecord),
        ...Object.keys(rightRecord),
      ])].sort();
      for (const key of keys) {
        visit(
          leftRecord[key],
          rightRecord[key],
          childPath(path, key, false),
          Object.hasOwn(leftRecord, key),
          Object.hasOwn(rightRecord, key),
        );
      }
      return;
    }

    changes.push({
      path,
      kind: "changed",
      before: left,
      after: right,
    });
  }

  visit(before, after, "");
  return changes;
}
