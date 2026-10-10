import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
const root = process.cwd();
const application = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(application.private, true);
assert.equal(application.license, "UNLICENSED", "Application/content license belongs to its owner");
for (const name of ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE"]) {
  await assert.rejects(access(join(root, name)), { code: "ENOENT" });
  assert.ok((await readFile(join(root, "licenses/template", name), "utf8")).length > 100);
}
assert.match(await readFile(join(root, "licenses/template/README.md"), "utf8"), /does not license.*replacement content/);
for (const name of ["astromache", "@effortlessmetrics/still", "@effortlessmetrics/astro-offline"]) {
  assert.ok(name in application.dependencies, `${name} dependency is required by this starter`);
  const dependency = JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8"));
  const declared = application.dependencies[name];
  if (declared.startsWith("file:")) {
    const receipt = JSON.parse(await readFile(join(root, "STARTER-DELIVERY.json"), "utf8"));
    const archive = receipt.archives?.[name];
    assert.ok(archive, `${name} bundled archive receipt is required`);
    assert.equal(declared, `file:${archive.file}`, `${name} bundled path must match delivery receipt`);
    assert.equal(dependency.version, archive.version, `${name} installed version must match delivery receipt`);
    const sha256 = createHash("sha256").update(await readFile(join(root, archive.file))).digest("hex");
    assert.equal(sha256, archive.sha256, `${name} bundled archive integrity mismatch`);
  } else {
    assert.match(declared, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/, `${name} registry dependency must use an exact version`);
    assert.equal(dependency.version, declared, `${name} exact registry version must match installed version`);
  }
  assert.equal(dependency.license, "MIT OR Apache-2.0", "Preserve dependency terms independently");
  for (const notice of ["LICENSE-MIT", "LICENSE-APACHE"])
    assert.ok((await readFile(join(root, "node_modules", name, notice), "utf8")).length > 1000);
}
console.log("Application UNLICENSED; upstream template notices scoped; dependency grants retained; replacement content remains owner-controlled.");
