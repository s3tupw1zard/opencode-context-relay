import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const endpoint = process.argv[2];
if (!endpoint)
  throw new Error(
    "Usage: node scripts/package-plugin.mjs https://YOUR_VERIFIED_DOMAIN/mcp",
  );
const url = new URL(endpoint);
if (
  url.protocol !== "https:" ||
  url.pathname !== "/mcp" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
)
  throw new Error("Expected HTTPS /mcp URL without credentials/query");
const temp = await mkdtemp(join(tmpdir(), "context-plugin-"));
try {
  const dir = join(temp, "context-bridge-chatgpt");
  await mkdir(dir);
  const manifest = JSON.parse(
    await readFile(new URL("../plugin/plugin.json", import.meta.url), "utf8"),
  );
  await writeFile(join(dir, "plugin.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    join(dir, "mcp.json"),
    JSON.stringify(
      {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          "context-bridge": { type: "streamable-http", url: endpoint },
        },
      },
      null,
      2,
    ),
  );
  const archive = resolve("context-bridge-chatgpt-plugin.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", temp, "context-bridge-chatgpt"]);
  console.log(archive);
} finally {
  await rm(temp, { recursive: true, force: true });
}
