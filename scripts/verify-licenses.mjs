import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
const root = process.cwd();
const application = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(application.private, true);
assert.equal(application.license, "UNLICENSED", "Application/content license belongs to its owner");
for (const name of ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE"]) {
  await assert.rejects(access(join(root, name)), { code: "ENOENT" });
  assert.ok((await readFile(join(root, "licenses/template", name), "utf8")).length > 100);
}
assert.match(await readFile(join(root, "licenses/template/README.md"), "utf8"), /does not license.*replacement content/);
for (const name of ["astromache", "@effortlessmetrics/still"].filter(name => name in application.dependencies)) {
  const dependency = JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8"));
  assert.equal(dependency.license, "MIT OR Apache-2.0", "Preserve dependency terms independently");
  for (const notice of ["LICENSE-MIT", "LICENSE-APACHE"])
    assert.ok((await readFile(join(root, "node_modules", name, notice), "utf8")).length > 1000);
}
console.log("Application UNLICENSED; upstream template notices scoped; dependency grants retained; replacement content remains owner-controlled.");
