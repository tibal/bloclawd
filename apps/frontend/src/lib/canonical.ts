const encoder = new TextEncoder();

export function canonicalize(value: unknown): Uint8Array {
  return encoder.encode(serializeCanonical(value));
}

function serializeCanonical(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("non-finite numbers not allowed in JCS");
      }
      return value.toString();
    case "string":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map(serializeCanonical).join(",")}]`;
      }
      return serializeObject(value as Record<string, unknown>);
    default:
      throw new Error(`unsupported value type: ${typeof value}`);
  }
}

function serializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort(compareCodePoints);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${serializeCanonical(obj[key])}`)
    .join(",")}}`;
}

function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const len = Math.min(left.length, right.length);

  for (let idx = 0; idx < len; idx += 1) {
    const leftCode = left[idx].codePointAt(0) ?? 0;
    const rightCode = right[idx].codePointAt(0) ?? 0;
    if (leftCode !== rightCode) {
      return leftCode - rightCode;
    }
  }

  return left.length - right.length;
}
