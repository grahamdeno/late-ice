import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrate = readFileSync(resolve(root, ".github/workflows/db-migrate.yml"), "utf8");
const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");

function stepBody(yml: string, name: string) {
  const start = yml.indexOf(`name: ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  const next = yml.indexOf("\n      - ", start + 1);
  return yml.slice(start, next === -1 ? undefined : next);
}

describe("release workflows", () => {
  it("dumps, compresses, and uploads before db push, and stops when any of those fail", () => {
    const dump = migrate.indexOf("pg_dump");
    const gzip = migrate.indexOf("gzip -c");
    const check = migrate.indexOf("gzip -t");
    const upload = migrate.indexOf("actions/upload-artifact@v4");
    const push = migrate.indexOf("db push");
    expect(dump).toBeGreaterThan(-1);
    expect(gzip).toBeGreaterThan(dump);
    expect(check).toBeGreaterThan(gzip);
    expect(upload).toBeGreaterThan(check);
    expect(push).toBeGreaterThan(upload);

    const backup = stepBody(migrate, "Back up the database");
    expect(backup.indexOf("set -o pipefail")).toBeGreaterThan(-1);
    expect(backup.indexOf("set -o pipefail")).toBeLessThan(backup.indexOf("pg_dump"));
    expect(backup.indexOf('echo "skip=false"')).toBeGreaterThan(backup.indexOf("gzip -t"));
    expect(backup).toContain("test -s");
    expect(backup).not.toContain('echo "$SUPABASE_DB_URL"');
    expect(backup).not.toContain("echo $SUPABASE_DB_URL");
    expect(backup).not.toContain("set -x");

    const uploadStep = stepBody(migrate, "Upload pre-migration backup");
    expect(uploadStep).toContain("success() && steps.backup.outputs.skip != 'true'");
    expect(uploadStep).toContain("retention-days: 30");
    expect(uploadStep).toContain("if-no-files-found: error");

    const apply = stepBody(migrate, "Apply migrations");
    expect(apply).toContain("success() && steps.backup.outputs.skip != 'true'");
    expect(apply).not.toContain("always()");
    expect(apply).not.toContain("failure()");
  });

  it("keeps migration off this branch and off pull requests", () => {
    expect(migrate).toContain("branches: [master, nextjs-supabase]");
    expect(migrate).not.toContain("pull_request:");
    expect(migrate).not.toContain("grok/");
    expect(migrate).not.toContain("permissions:");
    expect(migrate).toContain("workflow_dispatch:");
  });

  it("runs unit tests after the build and lint without failing the job", () => {
    const build = ci.indexOf("npm run build");
    const test = ci.indexOf("npm test");
    expect(build).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(build);
    const lint = stepBody(ci, "Lint");
    expect(lint).toContain("continue-on-error: true");
    expect(lint).toContain("npx next lint");
    expect(ci).toContain("branches-ignore: [master, ci-shots, ux-audit-results]");
  });
});
