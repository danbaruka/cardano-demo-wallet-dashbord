---
name: Bug report
description: Report a bug or unexpected behavior
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for helping improve this project. Please provide the details below.

  - type: textarea
    id: description
    attributes:
      label: Description
      description: Clear description of the bug
      placeholder: What happened? What did you expect?
    validations:
      required: true

  - type: input
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: e.g. 1. Open app 2. Click X 3. See error
    validations:
      required: true

  - type: input
    id: environment
    attributes:
      label: Environment
      placeholder: e.g. Node 20, npm 10, Chrome 120, mainnet
    validations:
      required: false

  - type: textarea
    id: extra
    attributes:
      label: Additional context
      placeholder: Logs, screenshots, .env (no secrets)
    validations:
      required: false

  - type: checkboxes
    id: checks
    attributes:
      label: Checks
      options:
        - label: I have read CONTRIBUTING.md and searched existing issues
          required: true
