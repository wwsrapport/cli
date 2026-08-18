# WWSrapport CLI

Command line client for the WWSrapport API.

## Install

```bash
npm install -g @wwsrapport/cli
```

Until the package is published, run it from this repository:

```bash
node bin/wwsrapport.js --help
```

## Configure

```bash
export WWSRAPPORT_API_KEY="wwsr_sandbox_..."
export WWSRAPPORT_BASE_URL="https://wwsrapport.nl/v1"
```

OAuth client credentials can be used instead of an API key with
`WWSRAPPORT_CLIENT_ID`, `WWSRAPPORT_CLIENT_SECRET` and optional
`WWSRAPPORT_OAUTH_SCOPES`. Public-sector integrations can send approved context
through `WWSRAPPORT_MUNICIPALITY_CODE`, `WWSRAPPORT_PURPOSE_CODE`,
`WWSRAPPORT_CASE_REFERENCE` and `WWSRAPPORT_CLIENT_REFERENCE`.

## Examples

```bash
wwsrapport prefill --postcode 3905RB --house-number 4
wwsrapport validate --file report-input.json
wwsrapport create --file report-input.json --idempotency-key crm-123
wwsrapport get rpt_...
wwsrapport calculation rpt_...
wwsrapport improvement-advice rpt_...
wwsrapport documents rpt_...
wwsrapport verification WWS-2026-000038
wwsrapport registry:bag-reference 0123456789012345
wwsrapport registry:search-by-bag 0123456789012345
wwsrapport download rpt_... --type wws-report --output WWSrapport.pdf
wwsrapport recalculate rpt_... --idempotency-key recalc-123 --rule-version latest
wwsrapport webhooks:list
wwsrapport review rpt_... --file review.json --idempotency-key review-123
wwsrapport batch:create --file batch.json --idempotency-key batch-123
wwsrapport batch:get batch_...
wwsrapport export:create --idempotency-key export-123
wwsrapport export:get export_...
wwsrapport offboarding:request --reference administrator-001
```
