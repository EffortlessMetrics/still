import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
const root = process.cwd();
const application = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
/** Check retained upstream grants independently of consumer application terms. */
function retainedNotice(text, name) {
  assert.ok(text.length > (name === 'LICENSE' ? 100 : 1000), `${name} notice is retained`);
  if (name !== 'LICENSE-APACHE')
    assert.match(text, /Copyright[^\n]*Steven Zimmerman/, `${name} upstream attribution is retained`);
  if (name === 'LICENSE') assert.match(text, /MIT OR Apache-2\.0/);
  if (name === 'LICENSE-MIT') {
    assert.match(text, /Permission is hereby granted/);
    assert.match(text, /The above copyright notice and this permission notice/);
    assert.match(text, /THE SOFTWARE IS PROVIDED "AS IS"/);
  }
  if (name === 'LICENSE-APACHE') {
    // Complete standard terms from https://www.apache.org/licenses/LICENSE-2.0.txt.
    // Normalize whitespace so line wrapping and CRLF do not change the check.
    const terms = text.match(/Apache\s+License\s+Version\s+2\.0,\s+January\s+2004\s+http:\/\/www\.apache\.org\/licenses\/[\s\S]*?END\s+OF\s+TERMS\s+AND\s+CONDITIONS/)?.[0];
    assert.ok(terms, `${name} complete Apache 2.0 terms are retained`);
    const sha256 = createHash('sha256').update(terms.replace(/\s+/g, ' ').trim()).digest('hex');
    assert.equal(sha256, '59d8f0ba87ad9a2f1a431123c8d16646e5b89ba53653e818f16d136d77263c99', `${name} complete Apache 2.0 terms are retained`);
  }
}
for (const name of ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE"]) {
  retainedNotice(await readFile(join(root, "licenses/template", name), "utf8"), name);
}
assert.match(await readFile(join(root, "licenses/template/README.md"), "utf8"), /does not license.*replacement content/);
for (const name of ["astromache", "@effortlessmetrics/still", "@effortlessmetrics/astro-offline"]) {
  assert.ok(name in application.dependencies, `${name} dependency is required by this starter`);
  const dependency = JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8"));
  assert.equal(dependency.name, name, `${name} installed package identity must match`);
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
    retainedNotice(await readFile(join(root, "node_modules", name, notice), "utf8"), notice);
}
console.log("Upstream template notices scoped; dependency grants retained; application metadata and replacement-content terms remain owner-controlled.");
