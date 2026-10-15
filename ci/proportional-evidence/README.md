# Proportional evidence qualification — inactive proposal

This directory is a source proposal, not an activated workflow. The live
`.github/workflows/starter.yml` is unchanged. `starter.yml.proposed` is outside
GitHub's workflow discovery directory. No deploy, release, dispatch, permission
change, environment activation or workflow skip marker is introduced.

## Ownership and baseline

Prepared for source thread `01a10fe7-9e5f-728d-b4a0-038aed109023`, against main
`d691545985cb20ab3848d34cb323bf224b5132b4`. Refreshed open PRs #17 (config migration,
`c5fec852cbc8431967a0525ac6a502832211f909`) and #19 (base guard,
`67e5872ff3bca253b249637566fbc7258df50c6b`) and remote owner branches. No overlapping
CI repair was found. This contribution touches only this new directory; delivery,
route tests, runtime, accepted archives and prior evidence remain with their owners.
No repository AGENTS.md or .agents skills were found; workspace instruction
directories are empty. The deliver-engineering-work skill guides this contribution.

The CI dependency is recorded in issue 21 comment 6185192739:
https://github.com/EffortlessMetrics/still/issues/21#issuecomment-6185192739
That correction distinguishes inherited scheduling records from actual user holds.
Do not reinstate the disavowed publication hold. Current instructions explicitly
exclude live activation of this proposal.

## Route and contracts

The proposed workflow retains the existing main push and PR triggers, exact head
checkout, pinned actions, read-only contents permission and full preview/production
matrix commands. The existing matrix is build/verification qualification; its
`production` label is not a deployment step. No path filters or draft exclusions
suppress required workflow creation.

A small router compares the event's immutable commits using NUL-delimited Git
paths. PRs use merge-base-to-head, main pushes use before-to-after. Renames are
expanded into deletion/addition. Only changes entirely under the two reviewed
`evidence/sw-lifecycle/` and `evidence/sw-failed-precache/` namespaces select the
narrow route. Every other path (including scripts, docs, configuration, CI policy,
delivery records, dependencies, unknown evidence namespaces), mixed diff, empty
diff, missing history, malformed event, zero SHA, unsupported event or wrong
checkout selects full qualification. Router failure blocks the aggregate gate.
Branch names, commit messages and draft status never grant a narrow route.

Evidence is an audit corpus, not a product input. Keep these namespaces outside
application imports, build inputs and runtime dependency discovery. If that
contract changes, remove the affected namespace from the allowlist in the same
product-qualified change. This policy is source-reviewed rather than an attempted
static proof of arbitrary JavaScript dependency behavior.

The evidence job runs once on every candidate, without npm install or browser
provisioning. It checks tracked regular files, all JS probe syntax, JSON/JSONL
parsing, SHA256SUMS record safety, complete digest coverage and content digests.
It neither executes probes nor interprets recorded `passed` fields as fresh
browser proof. Existing metadata and historical proof identities are retained.
Probe behavior changes require substantive independent review and appropriately
scoped opt-in execution before their resulting evidence can be accepted.

The aggregate `qualification` job always runs. Evidence-only success requires a
successful router and evidence job and a skipped matrix. Product success requires
both jobs plus a successful full matrix. Missing output, failure, cancellation or
an unexpected skip fails. Existing matrix/check names are retained. No repository
protection setting is changed by this proposal.

## Local validation

Use Node 24.19.0/npm 11.9.0 (no dependency installation needed):

```sh
node --test ci/proportional-evidence/*.test.mjs
node ci/proportional-evidence/validate.mjs
```

Tests create disposable Git histories, exercise both event fixtures, product and
unknown boundaries, mixed changes, rename/delete behavior, merge-base differences,
missing commits and stale checkout identities. They corrupt scripts, JSON, JSONL,
digests and manifest targets and reject symlinks. The aggregate's actual Bash
script is exercised across all 192 result/output combinations. Product steps and
workflow trigger/permission prefix are compared byte-for-byte with the current
live workflow. Reconcile that contract test deliberately when the live workflow
changes; do not silently overwrite another owner's work.

A separate local YAML parser read the full proposal successfully. YAML parsing
and local fixtures do not establish GitHub-hosted expression/scheduler acceptance.
No hosted Actions run is claimed. Repository-specific protection/check mapping
remains an integration-owner decision, with existing protections preserved.

The exact existing evidence commit `c55371d68d46b1e966664052fb7817ac7d9409cb`
authenticates 17 tracked files / 15 digested payloads with this validator. Its
comparison against main correctly selects FULL: the branch also contains
`DELIVERY-VALIDATION.md`, delivery scripts and offline route-test changes.
Its tracking-only delta from `ee8f34df559abdd36d1a41a32fe83f3073d37c35`
selects EVIDENCE ONLY. Do not rebrand the composite branch as evidence-only or
exclude its scripts to get a cheaper check. These checks parse/authenticate
existing evidence; they do not rerun or broaden its browser claims.

## Explicit integration steps (not executed)

1. Refresh main, PRs #17/#19, source instructions, active owners and actual user
   holds. Reconcile this disjoint policy contribution with the combined delivery
   candidate without rewriting the originals. Preserve prior evidence commit,
   tree, browser/runtime and result identities.
2. Obtain authorization for live CI activation separately. Review the exact
   combined candidate and the inactive YAML. Confirm required-check mapping with
   the repository owner; the aggregate must be enforced through the repository's
   existing supported protection process. Do not weaken/remove current checks or
   alter permissions to fit this proposal. If permissions/settings work is needed,
   leave it to the separately authorized owner.
3. At the coordinated integration gate, copy `starter.yml.proposed` over the live
   workflow, reconcile any intervening live changes, rerun focused contracts and
   a workflow schema/action linter. Review exact-head source again. This activation
   changes a workflow path and therefore must receive full preview/production
   qualification once. Avoid opening separate preliminary PRs that each run the
   old unconditional matrix. Keep normal hooks/commit/push and draft PR procedures;
   use no skip markers, alternate base or protection bypass.
4. After authorized workflow integration, verify real evidence-only and mixed
   product/evidence PRs: evidence validator once; matrix skipped only for the first,
   both existing matrix environments for the second; aggregate blocks deliberate
   syntax/digest corruption and a failed product job. Observe actual required
   statuses and reviews on the exact candidate before any integration decision.
5. Integrate `c55371d` with the existing delivery candidate at its coordinated gate,
   or copy its reviewed evidence-only slice with explicit original provenance.
   Its complete diff against current main still requires the full product route.
   Refresh affected proof, inspect current-head checks/threads/reviews and use
   protected repository integration. No merge, deployment, release or activation
   is authorized or performed by this source proposal.

A new draft PR against current main would still run the old unconditional matrix.
This lane publishes a normal branch plus a prepared draft description, leaving
that hosted duplication to the coordinated integration gate. This is an execution
constraint of the current workflow, not a fabricated user publication hold.
