# Release process

1. Update package.json, package-lock.json, scripts/install.mjs VERSION, and the local Claude plugin manifest to the same version. Update documentation, installer URLs, changelog, and docs/RELEASE-NOTES.md.
2. Run `npm ci`, `npm run check`, `npm test`, and `cargo test --locked --manifest-path prototypes/popup/Cargo.toml`.
3. Commit and push. Create a version tag matching the package version, such as `v0.3.0-alpha.6`, then push that tag.
4. The release workflow tests Node 22.18 and 24, builds and tests native popup binaries on macOS arm64/x64 and Linux arm64/x64, and tests clean installation on each platform.
5. Only after every job passes, the workflow publishes a GitHub prerelease containing the source archive, installer, four binaries, and SHA256SUMS. Tags and existing release assets should not be overwritten; corrections get a new version.
6. Download the published installer and test with an isolated `--prefix`, then update the website setup links.

The source archive uses an explicit list and excludes task history, local settings, website artwork, dependencies, and build outputs. GitHub Pages builds only the static website assets. Software is MIT licensed; supplied website artwork is excluded.

Runner labels are documented in [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Homebrew and npm packages

Every tagged release builds an npm tarball (`bohselecta-VERSION.tgz`) containing compiled JavaScript and four prebuilt popup binaries. There are no lifecycle install scripts. The source checkout stays private in package.json so it cannot accidentally publish uncompiled TypeScript. `scripts/package-npm.mjs` creates the publishable manifest.

Release jobs test npm global installation, installed hook imports, offline routing, native rendering, and npx on each platform before publishing. `scripts/generate-homebrew.mjs` creates the formula from the release source and native assets with SHA-256 hashes. The tap checks hourly for a checksummed formula asset and runs clean installation tests after updating.

### First npm registry publication

1. Run `npm login` on the publishing machine. Do not put credentials in the repository.
2. Download the npm tarball and SHA256SUMS from the release and verify its checksum.
3. Run `npm publish bohselecta-VERSION.tgz --access public --tag alpha`. Complete npm's interactive authentication if requested.
4. Configure a trusted publisher for package `bohselecta`: GitHub owner `irvdotdev`, repository `bohselecta`, workflow `npm.yml`, environment `npm`.
5. Subsequent releases can use the **Publish verified npm package** workflow with the release tag. It verifies the already-tested release tarball before publishing via OIDC. No stored npm token is needed.

Keep the website's short npm commands unpublished until the registry package resolves. The tarball URL works with npm and npx independently of registry publication.
