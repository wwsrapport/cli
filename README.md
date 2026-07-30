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

## Examples

```bash
wwsrapport prefill --postcode 3905RB --house-number 4
wwsrapport validate --file report-input.json
wwsrapport create --file report-input.json --idempotency-key crm-123
wwsrapport get rpt_...
wwsrapport calculation rpt_...
wwsrapport improvement-advice rpt_...
wwsrapport documents rpt_...
wwsrapport download rpt_... --type wws-report --output WWSrapport.pdf
wwsrapport recalculate rpt_... --idempotency-key recalc-123 --rule-version latest
wwsrapport webhooks:list
```

