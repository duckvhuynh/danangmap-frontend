import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import openapiTS, { astToString } from "openapi-typescript";

const execFileAsync = promisify(execFile);
const backendRepoUrl = new URL("../../danangmap-backend/", import.meta.url);
const provenanceUrl = new URL("../openapi/provenance.json", import.meta.url);
const sourceUrl = new URL("../openapi/openapi.json", import.meta.url);
const outputUrl = new URL("../src/lib/api/generated/schema.ts", import.meta.url);
const provenance = JSON.parse(await readFile(provenanceUrl, "utf8"));
const backendCommit = provenance.backendCommit;
if (typeof backendCommit !== "string" || !/^[0-9a-f]{40}$/.test(backendCommit)) {
  throw new Error(`Invalid pinned backend commit in ${fileURLToPath(provenanceUrl)}`);
}
if (process.argv.includes("--sync")) {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", fileURLToPath(backendRepoUrl), "show", `${backendCommit}:openapi/openapi.json`],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  await mkdir(new URL("../openapi/", import.meta.url), { recursive: true });
  await writeFile(sourceUrl, stdout, "utf8");
  await writeFile(
    provenanceUrl,
    `${JSON.stringify({ backendCommit, openapiSha256: createHash("sha256").update(stdout).digest("hex") }, null, 2)}\n`,
    "utf8",
  );
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
  if (provenance.openapiSha256 !== digest) {
    console.error(`Pinned OpenAPI artifact does not match ${fileURLToPath(provenanceUrl)}`);
    process.exitCode = 1;
  }
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== expected) {
    console.error(`Generated API client is stale: ${fileURLToPath(outputUrl)}`);
    process.exitCode = 1;
  }
} else {
  await writeFile(outputUrl, expected);
  console.log(`Generated ${fileURLToPath(outputUrl)} from ${fileURLToPath(sourceUrl)}`);
}
