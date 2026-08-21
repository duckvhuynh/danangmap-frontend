# Real-stack acceptance

The publication history suite runs only against the external Docker stack. It never intercepts or mocks an API route.

Run it with:

```powershell
$env:DANANGMAP_REAL_STACK = "true"
$env:DANANGMAP_HISTORY_ENABLED = "true"
$env:PLAYWRIGHT_BASE_URL = "https://gateway"
npm run test:e2e:real:history
```

The deterministic harness must provide these secret environment variables:

- `DANANGMAP_GATE_B_EDITOR_LOGIN`
- `DANANGMAP_GATE_B_EDITOR_PASSWORD`
- `DANANGMAP_GATE_B_REVIEWER_LOGIN`
- `DANANGMAP_GATE_B_REVIEWER_PASSWORD`
- `DANANGMAP_GATE_B_PUBLISHER_LOGIN`
- `DANANGMAP_GATE_B_PUBLISHER_PASSWORD`
- `DANANGMAP_GATE_B_TOTP_SECRET`
- `DANANGMAP_HISTORY_ROLLBACK_PUBLISHER_LOGIN`
- `DANANGMAP_HISTORY_ROLLBACK_PUBLISHER_PASSWORD`
- `DANANGMAP_HISTORY_SYSTEM_ADMIN_LOGIN`
- `DANANGMAP_HISTORY_SYSTEM_ADMIN_PASSWORD`
- `DANANGMAP_HISTORY_TOTP_SECRET`

Editor, Reviewer, Publisher, rollback Publisher and System Admin must be distinct active accounts. The rollback Publisher must not participate in creating, reviewing or publishing the target revisions, so the suite validates separation of duties instead of bypassing it. Do not commit credentials or TOTP seeds to the frontend repository.
