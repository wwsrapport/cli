#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const baseUrl = (process.env.WWSRAPPORT_BASE_URL || 'https://wwsrapport.nl/v1').replace(/\/+$/, '');
const apiKey = process.env.WWSRAPPORT_API_KEY;

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || command === '--help' || command === 'help') {
  help();
  process.exit(0);
}

if (!apiKey) {
  fail('Set WWSRAPPORT_API_KEY first.');
}

main().catch((error) => {
  fail(error.message || String(error));
});

async function main() {
  switch (command) {
    case 'prefill':
      await printJson(await request('POST', '/properties/prefill', {
        address: {
          postcode: required(args.postcode, '--postcode'),
          house_number: required(args['house-number'], '--house-number'),
          house_number_addition: args.addition || undefined,
          country: args.country || 'NL',
        },
      }));
      break;
    case 'validate':
      await printJson(await request('POST', '/reports/validate', await readJson(required(args.file, '--file'))));
      break;
    case 'create':
      await printJson(await request('POST', '/reports', await readJson(required(args.file, '--file')), {
        'Idempotency-Key': required(args['idempotency-key'], '--idempotency-key'),
      }));
      break;
    case 'recalculate':
      await printJson(await request('POST', `/reports/${encodeURIComponent(required(args._[0], 'report_id'))}/recalculate`, {
        rule_version: args['rule-version'] || 'latest',
        refresh_sources: args['refresh-sources'] === 'true',
      }, {
        'Idempotency-Key': required(args['idempotency-key'], '--idempotency-key'),
      }));
      break;
    case 'list':
      await printJson(await request('GET', '/reports'));
      break;
    case 'get':
      await printJson(await request('GET', `/reports/${encodeURIComponent(required(args._[0], 'report_id'))}`));
      break;
    case 'calculation':
      await printJson(await request('GET', `/reports/${encodeURIComponent(required(args._[0], 'report_id'))}/calculation`));
      break;
    case 'improvement-advice':
      await printJson(await request('GET', `/reports/${encodeURIComponent(required(args._[0], 'report_id'))}/improvement-advice`));
      break;
    case 'documents':
      await printJson(await request('GET', `/reports/${encodeURIComponent(required(args._[0], 'report_id'))}/documents`));
      break;
    case 'download':
      await downloadDocument(required(args._[0], 'report_id'), args.type || 'wws-report', required(args.output, '--output'));
      break;
    case 'usage':
      await printJson(await request('GET', '/usage/current'));
      break;
    case 'rulesets':
      await printJson(await request('GET', '/rulesets'));
      break;
    case 'webhooks:list':
      await printJson(await request('GET', '/webhooks'));
      break;
    case 'webhooks:test':
      await printJson(await request('POST', `/webhooks/${encodeURIComponent(required(args._[0], 'webhook_id'))}/test`));
      break;
    default:
      fail(`Unknown command: ${command}`);
  }
}

async function request(method, path, body = undefined, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-WWSrapport-Client': '@wwsrapport/cli/0.1.0',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WWSrapport API HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function downloadDocument(reportId, type, output) {
  const endpoint = type === 'improvement-advice' ? 'improvement-advice' : 'wws-report';
  const response = await fetch(`${baseUrl}/reports/${encodeURIComponent(reportId)}/documents/${endpoint}`, {
    headers: {
      Accept: 'application/pdf, application/octet-stream',
      Authorization: `Bearer ${apiKey}`,
      'X-WWSrapport-Client': '@wwsrapport/cli/0.1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`WWSrapport API HTTP ${response.status}: ${await response.text()}`);
  }

  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  console.log(`Saved ${output}`);
}

function parseArgs(values) {
  const result = { _: [] };
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function required(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function help() {
  console.log(`WWSrapport CLI

Usage:
  wwsrapport prefill --postcode 3905RB --house-number 4
  wwsrapport validate --file report-input.json
  wwsrapport create --file report-input.json --idempotency-key crm-123
  wwsrapport recalculate rpt_... --idempotency-key recalc-123 [--rule-version latest] [--refresh-sources true]
  wwsrapport list
  wwsrapport get rpt_...
  wwsrapport calculation rpt_...
  wwsrapport improvement-advice rpt_...
  wwsrapport documents rpt_...
  wwsrapport download rpt_... --type wws-report --output WWSrapport.pdf
  wwsrapport usage
  wwsrapport rulesets
  wwsrapport webhooks:list
  wwsrapport webhooks:test wh_...
`);
}
