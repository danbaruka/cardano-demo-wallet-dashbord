# Security Policy

## Supported Versions

We provide security updates for the current default branch. This project is an **exercise and example** for developer experience; for production use, always pin dependencies and review your own security requirements.

## Reporting a Vulnerability

If you believe you have found a security vulnerability, please report it responsibly:

1. **Do not** open a public issue for security-sensitive findings.
2. Email or contact the maintainers privately (e.g. via the repository’s “Security” tab or owner contact if listed).
3. Include a clear description, steps to reproduce, and impact if possible.
4. Allow a reasonable time for a fix before any public disclosure.

We will acknowledge your report and work with you to understand and address the issue.

## Best Practices

- Do not commit API keys, secrets, or `.env` files. Use `env.sample` as a template and keep real values in `.env.local` (which is gitignored).
- Keep dependencies up to date with `npm audit` and address high/critical findings where practical.
- This demo uses public Koios endpoints; in production, follow your provider’s security and rate-limiting guidelines.
