# Contributing to Cardano Demo Wallet Dashboard

Thank you for your interest in contributing. This project is an **exercise and example** for developer experience: we use it for learning, workshops, and as a reference. Your contributions help others learn and improve the codebase.

## Ways to Contribute

- **Code:** Fix bugs, add features, or improve structure and types.
- **Docs:** Update README, comments, or add usage examples.
- **Issues:** Report bugs or suggest improvements via GitHub Issues (see the repository URL in README or your fork).
- **Pull requests:** Implement fixes or features and follow the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Local Setup

1. **Fork and clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cardano-demo-wallet-dashbord.git  # or your org's repo URL
   cd cardano-demo-wallet-dashbord
   ```

2. **Install and run**
   ```bash
   npm install
   cp env.sample .env.local
   # Edit .env.local with your Koios endpoint and network
   npm run dev
   ```

3. **Create a branch**
   ```bash
   git checkout -b fix/your-change   # or feature/your-feature
   ```

### Making Changes

- Follow existing code style (TypeScript, React, Vite).
- Keep commits focused and messages clear (e.g. `fix: correct balance display`, `feat: add network switcher`).
- Run `npm run build` before submitting a PR to ensure the project builds.

### Submitting a Pull Request

1. Open a PR against the default branch (`main`).
2. Fill out the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
3. Ensure CI (if any) and `npm run build` pass.
4. Address review feedback promptly.

## Code of Conduct

By participating, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful and constructive.

## Questions

- Open a Discussion (in the repo where you contribute) for questions or ideas.
- For security concerns, see [SECURITY.md](SECURITY.md).
