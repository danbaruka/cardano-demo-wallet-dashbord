---
name: Feature request
description: Suggest a new feature or improvement
labels: ["enhancement"]
body:
  - type: markdown
    attributes:
      value: |
        This repo is an exercise/example for developer experience. Feature ideas are welcome.

  - type: textarea
    id: problem
    attributes:
      label: Problem or motivation
      description: What problem would this solve or what would it improve?
      placeholder: e.g. Hard to switch between mainnet and testnet
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How could we implement this?
      placeholder: e.g. Add a network dropdown in the header
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      placeholder: Other approaches you thought about
    validations:
      required: false

  - type: checkboxes
    id: checks
    attributes:
      label: Checks
      options:
        - label: I have searched existing issues and discussions
          required: true
