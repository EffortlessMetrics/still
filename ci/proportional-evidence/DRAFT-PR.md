Title: Prepare proportional evidence CI routing without activation

Every current PR to main runs the full preview/production matrix, including
branches that change only recorded browser evidence. Add a reviewed inactive
workflow proposal and focused routing/evidence contracts so allowlisted evidence
changes can validate scripts and records once, while product, mixed, unknown and
unreadable changes retain full product qualification.

The live workflow is unchanged. The proposal preserves its triggers, pinned
actions, permissions and complete matrix, adds an always-run evidence validator,
and an aggregate gate that rejects missing results, failures and unexpected skips.
Evidence validation checks syntax, JSON/JSONL and complete SHA256SUMS coverage;
it does not execute recorded browser probes or recertify historical results.

Validation: 12 focused tests pass on Node 24.19.0, including real Git histories and
192 aggregate-shell combinations. Independent review reports no blocking findings
and confirms allowlist, digest and rename mutations fail the tests. Exact c55371d
evidence authenticates 17 files/15 payloads. Its full branch still correctly routes
to full product qualification because it includes scripts and delivery changes.
Reviewed identities and limits are in ci/proportional-evidence/VALIDATION.md.

Integration: coordinate with the existing delivery owner, refresh exact candidates
and required statuses, obtain separate activation authority, reconcile protection
mapping without weakening existing checks, and qualify the workflow activation
once through normal draft/protected integration procedures. Full steps are in
ci/proportional-evidence/README.md. No activation, deployment, release, permission
change, merge or hosted Actions validation is claimed by this source proposal.
