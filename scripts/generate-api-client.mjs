import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const backendSourceUrl = new URL("../../danangmap-backend/openapi/openapi.json", import.meta.url);
const sourceUrl = new URL("../openapi/openapi.json", import.meta.url);
const outputUrl = new URL("../src/lib/api/generated/schema.ts", import.meta.url);
if (process.argv.includes("--sync")) {
  await mkdir(new URL("../openapi/", import.meta.url), { recursive: true });
  await writeFile(sourceUrl, await readFile(backendSourceUrl));
}
const source = await readFile(sourceUrl, "utf8");
const digest = createHash("sha256").update(source).digest("hex");
const schema = JSON.parse(source);
const generated = astToString(await openapiTS(schema));
const header = [
  "// This file is generated. Do not edit it by hand.",
  "// Source: openapi/openapi.json",
  `// Source SHA-256: ${digest}`,
  "",
].join("\n");
const expected = `${header}${generated}`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== expected) {
    console.error(`Generated API client is stale: ${fileURLToPath(outputUrl)}`);
    process.exitCode = 1;
  }
} else {
  await writeFile(outputUrl, expected);
  console.log(`Generated ${fileURLToPath(outputUrl)} from ${fileURLToPath(sourceUrl)}`);
}
