# bohselecta website

A compact website and interactive demo for bohselecta, a local model adviser for Claude Code and Codex.

This repository contains the website and documentation. The terminal service is not distributed here; the demo does not call a model.

## Project documentation

Read the [current documentation and changelog](https://irvdotdev.github.io/bohselecta/docs.html) for service setup, popup compatibility, commands, troubleshooting, pricing limits, and local data storage. Updated 28 September 2026 for Claude Code 2.1.282 and 2.1.283 automatic continuation.

The popup is an unreleased preview; the native hook release remains v0.2.2. Service setup commands require a separate service source checkout. Cloning this website repository is not a terminal-service installation.

## Local preview

With Node.js 22.18 or later:

```sh
npm run site
```

Open http://127.0.0.1:4173/. No npm dependencies or API keys are needed.

## Build

```sh
npm run site:build
```

The build recreates `dist/` with only public website assets. Edit the landing page in `website/index.html`, the guide in `website/docs.html`, styling in `website/style.css`, and demo interactions in `website/app.js`.

## GitHub Pages

The included workflow deploys website changes from the repository's default branch. In **Settings → Pages**, the source must be **GitHub Actions**. To redeploy manually, run **Deploy website to GitHub Pages** from the Actions tab.

All links and assets are relative and work under a repository subpath. Hosting uses GitHub's built-in token; no personal token belongs in this repository.

[GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
