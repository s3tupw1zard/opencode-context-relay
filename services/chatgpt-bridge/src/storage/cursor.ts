import { createHash } from "node:crypto";
import { z } from "zod";
import { SafeError } from "../domain/model.js";
import type { Query } from "./types.js";
const schema = z
  .object({
    t: z.string().datetime({ offset: true }),
    id: z.string().regex(/^\d+$/).max(19),
    scope: z.string().length(24),
  })
  .strict();
function scope(table: string, q: Query) {
  const { cursor: _cursor, limit: _limit, ...filter } = q;
  void _cursor;
  void _limit;
  return createHash("sha256")
    .update(
      JSON.stringify([
        table,
        Object.entries(filter)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ]),
    )
    .digest("hex")
    .slice(0, 24);
}
export function encodeCursor(table: string, q: Query, t: string, id: string) {
  return Buffer.from(
    JSON.stringify({ t, id, scope: scope(table, q) }),
  ).toString("base64url");
}
export function decodeCursor(table: string, q: Query) {
  if (!q.cursor) return undefined;
  try {
    const v = schema.parse(
      JSON.parse(Buffer.from(q.cursor, "base64url").toString()),
    );
    if (v.scope !== scope(table, q) || BigInt(v.id) > 9223372036854775807n)
      throw new Error();
    return v;
  } catch {
    throw new SafeError("invalid_cursor");
  }
}
