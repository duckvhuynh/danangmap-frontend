# Real-stack acceptance

The publication suites run only against the external Docker stack. They never intercept or mock an API route. Both suites require the durable async publication worker to be enabled in the acceptance stack; production activation remains controlled by the backend fail-closed guard.

Run it with:

```powershell
$env:DANANGMAP_REAL_STACK = "true"
$env:DANANGMAP_HISTORY_ENABLED = "true"
$env:DANANGMAP_ASYNC_PUBLICATION_ENABLED = "true"
$env:PLAYWRIGHT_BASE_URL = "https://gateway"
npm run test:e2e:real:history
```

Run the focused durable-publication flow with the same real Editor, Reviewer and Publisher accounts:

```powershell
$env:DANANGMAP_REAL_STACK = "true"
$env:DANANGMAP_ASYNC_PUBLICATION_ENABLED = "true"
$env:PLAYWRIGHT_BASE_URL = "https://gateway"
npm run test:e2e:real:publication
```

The focused running-worker smoke verifies the real `202` acceptance headers and desktop intent, renders the accepted job, opens a dedicated Pixel 7 browser session to confirm mobile mutation controls remain absent while tracking continues, observes terminal success, then reloads and recovers that terminal job. It does not stop/restart the worker, hold a job queued while checking the public pointer, prove queued recovery in a second tab, or require a nonterminal measured-progress sample. Those phased lifecycle checks belong to the external activation harness and remain required before production activation. The smoke has a bounded acceptance timeout; the application itself never stops tracking due to a poll-count limit.

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
