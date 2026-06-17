# Security Policy

## Reporting a Vulnerability

Do not open a public issue for a vulnerability that could expose repository data or credentials. Use GitHub private vulnerability reporting for this repository.

Include the affected version, reproduction steps, impact, and any suggested mitigation. Please avoid including real secrets or private repository contents in the report.

## Security Principles

- Scans are local and read-only by default.
- Secret findings report type and location, never the matched value.
- Plugins are explicit because they execute trusted local code.
- SetupLens does not include telemetry or a hosted upload service.
- Generated HTML reports contain findings and paths, so review them before sharing publicly.
