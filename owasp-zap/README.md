# ZAP Run Guide (itsag2t3)

This folder provides two automation plans:

- `itsag2t3-run-now.yaml` (quick baseline with admin + agent)
- `itsag2t3-comprehensive.yaml` (broader coverage: public + admin + agent + optional root)

Before running either plan, ensure the output folder exists:

```powershell
mkdir zap\outputs -ErrorAction SilentlyContinue
```

## 1) Quick plan (recommended first)

Use when you want a fast check and a report quickly.

### Edit credentials
Open `zap/itsag2t3-run-now.yaml` and update:
- `users -> admin-test -> credentials`
- `users -> agent-test -> credentials`

### Run
```powershell
docker run --rm -v "c:/Users/user/Documents/Github/project-2025-26-t2-project-2025-26t2-g2-t3:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable zap.sh -cmd -autorun /zap/wrk/zap/itsag2t3-run-now.yaml
```

### Output files
- `zap/outputs/itsag2t3-zap-report.html`
- `zap/outputs/itsag2t3-zap-report.json`

## 2) Comprehensive plan (deeper coverage)

Use when preparing final security evidence or before release.

### Edit credentials
Open `zap/itsag2t3-comprehensive.yaml` and fill:
- `admin-test`
- `agent-test`
- Optional `root-test` credentials (only if available)

Optional root pass jobs are included but disabled by default (`enabled: false`).
Set `enabled: true` for root jobs after filling `root-test` credentials.

### Run
```powershell
docker run --rm -v "c:/Users/user/Documents/Github/project-2025-26-t2-project-2025-26t2-g2-t3:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable zap.sh -cmd -autorun /zap/wrk/zap/itsag2t3-comprehensive.yaml
```

Coverage note for comprehensive plan:
- Includes unauthenticated checks (`/login` + `/api`)
- Includes authenticated admin and agent checks across both UI and API subtrees
- Uses longer passive-scan waits to capture delayed passive findings

### Output files
- `zap/outputs/itsag2t3-zap-comprehensive.html`
- `zap/outputs/itsag2t3-zap-comprehensive.json`

## 3) How to read the reports

### HTML report (`*.html`)

Use it for quick human review.

1. **Summary of Alerts**
   - Check counts for High / Medium / Low / Informational.
   - Start remediation from High, then Medium.
2. **Alerts section**
   - For each alert, inspect:
     - affected endpoint(s)
     - evidence
     - suggested solution
3. **Cross-check severity**
   - Some medium/low findings are hardening issues; still track and fix systematically.

### JSON report (`*.json`)

Use it for precise triage and evidence extraction.

Key fields:
- `site[].alerts[].alert` -> alert name
- `site[].alerts[].riskdesc` -> severity + confidence
- `site[].alerts[].instances[]` -> exact URLs/methods/params/evidence
- `insights[]` -> scan quality indicators

Useful interpretation tips:
- `insight.auth.failure` high -> auth/session instability during scan; verify login continuity.
- High `4xx` percentage -> many denied paths (can be normal), but check if intended endpoints were still exercised.
- Low endpoint totals -> likely incomplete crawl; increase spider/ajax durations or add manual browsing.

## 4) What is "good enough"

Minimum useful outcome:
- Scan succeeded for both admin and agent users
- No High findings
- Medium findings reviewed and triaged
- No obvious agent access to admin-only APIs

For stronger assurance:
- Run comprehensive plan
- Add manual authorization checks (agent hitting admin APIs directly)
- Re-run after fixes and compare results

## Notes

- App auth uses JSON login at `/api/auth/login` with `email/password`.
- If AJAX spider loses auth state, browse authenticated pages manually through ZAP first, then rerun active scan.
