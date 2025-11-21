# Dissonance UI (Electron Desktop App)

This repository contains the downloadable desktop app for the Dissonance project, built with Electron and web technologies.

---

## About

Dissonance UI is a cross-platform desktop app that helps defend audio content from unauthorized AI exploitation by applying imperceptible adversarial perturbations. It integrates with the Dissonance Core repo for its core audio protection logic.

---

## Tech Stack
- **Frontend:** HTML, CSS, JavaScript (React planned)
- **Desktop Packaging:** Electron
- **Build Tools:** electron-builder

---

## Two-Repo Architecture

- **Core Repo:** Contains the algorithm and audio processing logic, exposed as a native library or WebAssembly (WASM).
- **App Repo (this repo):** Electron/web app that pulls the core artifact for its functionality.

### Integration Workflow
1. The core repo builds and publishes its artifact (native library or WASM) to GitHub Releases, npm, or a public URL.
2. The app repo fetches the latest core artifact during build (using a script, npm package, or Git submodule).
3. The Electron app loads and uses the core functionality via Node.js bindings or WASM.

---

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the app locally:
   ```bash
   npm start
   ```

---

## CI/CD
- Automated builds and packaging via GitHub Actions.
- Downloadable installers published to GitHub Releases.

---

## License & Ethics
- Comply with GDPR, CCPA, and ethical data use standards
- Share research insights and results
- Engage transparently with the open-source and audio communities

---
