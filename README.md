# Cardano Demo Wallet Dashboard

**This repository is an exercise and example project for developer experience.** It is intended for learning, workshops, and as a reference implementation when building on Cardano. Use it to practice frontend tooling, wallet integration patterns, and contribution workflows.

Modern frontend dashboard for interacting with Cardano wallet services. Built with Vite, React, and TypeScript to provide a responsive experience for monitoring wallet balances, recent activity, and USD conversions through Koios APIs.

## Project Prerequisites

- Node.js 18+ (use `nvm` or `fnm` to match project version)
- npm 9+ (bundled with Node)
- Koios or another Cardano data service endpoint

## Getting Started

```bash
# install dependencies
npm install

# copy and customize the environment file
cp env.sample .env.local
# edit .env.local with your API keys and endpoints

# run the dev server
npm run dev
```

Open the dev server URL printed in the terminal (typically `http://localhost:5173`). Hot module replacement is enabled by default.

## Available Commands

```bash
npm run dev      # start the Vite dev server
npm run build    # create a production build in dist/
npm run preview  # serve the production build locally
```

## Environment Configuration

- `VITE_KOIOS_API_URL`: Base URL of the Koios endpoint.
- `VITE_CARDANO_NETWORK`: Network tag (`mainnet` or `testnet`).
- Add any secrets to `.env.local`; `.gitignore` prevents accidental commits.

## Project Structure

```text
src/
  components/            UI components for the dashboard
  services/              API clients and data transformers
  config.ts              Shared configuration values
  main.tsx               App entry point
public/                  Static assets
```

## Contributing

We welcome contributions. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) before opening an issue or pull request.

## License

This project is open source and available under the [MIT License](LICENSE).
