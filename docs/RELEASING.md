# Release process

1. Update package.json, package-lock.json, scripts/install.mjs VERSION, and the local Claude plugin manifest to the same version. Update documentation, installer URLs, changelog, and docs/RELEASE-NOTES.md.
2. Run `npm ci`, `npm run check`, `npm test`, and `cargo test --locked --manifest-path prototypes/popup/Cargo.toml`.
3. Commit and push. Create a version tag matching the package version, such as `v0.3.0-alpha.2`, then push that tag.
4. The release workflow tests Node 22.18 and 24, builds and tests native popup binaries on macOS arm64/x64 and Linux arm64/x64, and tests clean installation on each platform.
5. Only after every job passes, the workflow publishes a GitHub prerelease containing the source archive, installer, four binaries, and SHA256SUMS. Tags and existing release assets should not be overwritten; corrections get a new version.
6. Download the published installer and test with an isolated `--prefix`, then update the website setup links.

The source archive uses an explicit list and excludes task history, local settings, website artwork, dependencies, and build outputs. GitHub Pages builds only the static website assets. Software is MIT licensed; supplied website artwork is excluded.

Runner labels are documented in [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
