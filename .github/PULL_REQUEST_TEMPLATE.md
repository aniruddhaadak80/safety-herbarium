name: Pull request
description: A change to Safety Herbarium.
labels: ["pull request"]
body:
  - type: textarea
    id: what
    attributes:
      label: What this changes
      description: What a user can now do that they could not before.
    validations:
      required: true
  - type: textarea
    id: why
    attributes:
      label: Why
    validations:
      required: true
  - type: checkboxes
    id: gates
    attributes:
      label: Gates
      description: All of these must be true before this merges.
      options:
        - label: npm run check passes (typecheck, lint, test, build).
          required: true
        - label: npm run test:e2e passes, or the change is not reachable through the interface.
          required: true
        - label: Every new control calls a real route and reports a truthful state.
          required: true
        - label: New engine behaviour has unit tests, including a determinism case.
          required: false