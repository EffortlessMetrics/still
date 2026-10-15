# Review and execution record

Observation: 2026-10-15 06:11 UTC. Environment provisioning completed successfully
before execution. No dependency installation or browser provisioning was needed.
Node v24.19.0, npm 11.9.0, Bash, Git; local Python PyYAML 6.0.3 for YAML parsing.

Implementation candidate: `f2d506144c03f62ac7e29052c002c4e35aa3ed30`.
Tree: `62e77a2ea690413ee553c562156181578ae00bc9`.
Base: `d691545985cb20ab3848d34cb323bf224b5132b4`.
Subsequent validation-record/draft-description changes do not change executable
sources, tests, workflow fixture or event fixtures. Exact final head is recorded
by Git, rather than a self-referential hash in this file.

Owner and independent reviewer `/root/review_ci_route` both ran:
`node --test ci/proportional-evidence/*.test.mjs` — 12/12 PASS.
This includes actual Git history operations, syntactic/record/digest corruption,
symlink rejection and all 192 aggregate-shell outcome combinations.
`node ci/proportional-evidence/validate.mjs` passes with a visible empty corpus on
this source-only branch; no historical browser execution is attributed to it.

Both separately validated the original corpus at exact
`c55371d68d46b1e966664052fb7817ac7d9409cb`: 17 tracked files, 15 authenticated
payloads. Both checked real routing: full branch against main => product=true;
tracking-only change from `ee8f34df559abdd36d1a41a32fe83f3073d37c35`
=> product=false. Neither result changes the identity or scope of old browser proof.

Independent review found no blocking findings at the implementation candidate.
Reviewer used disposable mutation copies without changing the candidate:

- Allowing all paths as evidence causes three route test failures.
- Disabling digest comparison causes the corruption test to fail.
- Removing `--no-renames` causes the product-to-evidence move test to fail.

Reviewed source SHA256:

```text
e86c419259f0d02a1019cc2c264a3f72e8dbdb7801b522ba29378e93da42627a  route.mjs
446cf7794290b372a2b8d5e376412f47f0a7ac61c4d83c959c3eb1b0d7aeecd0  validate.mjs
d2e9b8a438538557758c1a6963f7b8472d1f157d079f9013de15f52cbfa97049  starter.yml.proposed
```

The complete proposal parsed with local PyYAML. Workflow contract tests compare
the current trigger/permission prefix and all existing product steps exactly.
Actionlint and GitHub-hosted scheduler/expression acceptance were not run.
The live workflow diff is empty. No full application build or browser probe was
rerun; these changes concern routing and evidence contracts only. No production
execution, deployment, release, merge, protection/permission/credential change or
security-research deletion occurred.

Publication deliberately uses a non-main branch: current main's only active
workflow runs on main pushes and all PRs to main. Opening even an inactive-proposal
draft PR would launch the old full matrix. `DRAFT-PR.md` is prepared text for the
coordinated integration gate, not a claim that a hosted draft was opened.
Activation, hosted workflow qualification and required-check mapping remain the
explicit unexecuted integration work described in README.md.
