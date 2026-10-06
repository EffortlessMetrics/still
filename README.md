# Still

Still is a readable Astro service-site design: cream and teal light colors, warm dark colors, large responsive typography, compact home pages, offer cards and aligned service columns. The package and the complete neutral starter live together here. A site is an independent consumer, supplying its own words, links, identity, assets and integrations.

Use Node 24.19 within major 24, then `npm ci`, `npm run check`, `npm test`, `npm run build` and `npm run test:browser`. Run `npm run dev --workspace starter` to explore the starter. It demonstrates a home page, three-column and two-column service pages, an informational contact page and a 404 page. Preview builds default to noindex. No contact service, analytics or automatic offline installation is included.

`packages/still` is the unpublished 0.2.0 candidate. It contains the actual reusable layout, header, footer, page sections, cards, actions, service columns and full responsive design stylesheet. It is compiled by Astro rather than imported as a Node JavaScript module. See [the package API](packages/still/README.md) and [design and ownership](docs/design.md).

This repository starts with a new root commit. Its source allowlist is reviewed before publication; it contains no imported Git history. Code is MIT OR Apache-2.0. Starter font files retain separate SIL OFL notices and provenance. The runtime package contains no fonts or private assets.

The 0.2.0 candidate supersedes the limited 0.1.0 API as a preparation artifact; no npm release is performed by these commands or by CI. Existing published 0.1.0 remains immutable. See [the candidate changes](docs/candidate-0.2.0.md).
