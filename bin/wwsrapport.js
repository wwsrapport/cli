#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const baseUrl = (process.env.WWSRAPPORT_BASE_URL || 'https://wwsrapport.nl/v1').replace(/\/+$/, '');
const apiKey = process.env.WWSRAPPORT_API_KEY;
const clientId = process.env.WWSRAPPORT_CLIENT_ID;
const clientSecret = process.env.WWSRAPPORT_CLIENT_SECRET;
const oauthScopes = process.env.WWSRAPPORT_SCOPES || '';
let cachedToken;

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || command === '--help' || command === 'help') {
  help();
  process.exit(0);
}

if (!apiKey && !(clientId && clientSecret)) {
  fail('Set WWSRAPPORT_API_KEY or WWSRAPPORT_CLIENT_ID and WWSRAPPORT_CLIENT_SECRET first.');
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
    case 'verification':
      await printJson(await request('GET', `/reports/${encodeURIComponent(required(args._[0], 'report_id'))}/verification`));
      break;
    case 'review':
      await printJson(await request('POST', `/reports/${encodeURIComponent(required(args._[0], 'report_id'))}/human-review`, await readJson(required(args.file, '--file')), {
        'Idempotency-Key': required(args['idempotency-key'], '--idempotency-key'),
      }));
      break;
    case 'batch:create':
      await printJson(await request('POST', '/batches', await readJson(required(args.file, '--file')), {
        'Idempotency-Key': required(args['idempotency-key'], '--idempotency-key'),
      }));
      break;
    case 'batch:get':
      await printJson(await request('GET', `/batches/${encodeURIComponent(required(args._[0], 'batch_id'))}`));
      break;
    case 'batch:retry':
      await printJson(await request('POST', `/batches/${encodeURIComponent(required(args._[0], 'batch_id'))}/retry`, undefined, {
        'Idempotency-Key': required(args['idempotency-key'], '--idempotency-key'),
      }));
      break;
    case 'export:create':
      await printJson(await request('POST', '/exports', undefined, { 'Idempotency-Key': required(args['idempotency-key'], '--idempotency-key') }));
      break;
    case 'export:get':
      await printJson(await request('GET', `/exports/${encodeURIComponent(required(args._[0], 'export_id'))}`));
      break;
    case 'offboarding:request':
      await printJson(await request('POST', '/offboarding', {
        confirmation: 'REQUEST_OFFBOARDING', requested_by_reference: required(args.reference, '--reference'), reason: args.reason,
      }));
      break;
    case 'registry:bag-reference':
      await printJson(await request('POST', '/registry/bag-reference', { bagVboId: required(args._[0], 'bag_vbo_id') }));
      break;
    case 'registry:search-by-bag':
      await printJson(await request('POST', '/registry/search-by-bag', { bagVboId: required(args._[0], 'bag_vbo_id') }));
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
  const token = await bearerToken();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-WWSrapport-Client': '@wwsrapport/cli/0.3.0',
      ...contextHeaders(),
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

async function bearerToken() {
  if (apiKey) return apiKey;
  if (cachedToken && Date.now() + 30_000 < cachedToken.expiresAt) return cachedToken.value;
  const tokenUrl = process.env.WWSRAPPORT_TOKEN_URL || `${new URL(baseUrl).origin}/oauth/token`;
  const form = new URLSearchParams({ grant_type: 'client_credentials' });
  if (oauthScopes) form.set('scope', oauthScopes);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`WWSrapport OAuth HTTP ${response.status}: ${JSON.stringify(payload)}`);
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 300) * 1000 };
  return cachedToken.value;
}

function contextHeaders() {
  return Object.fromEntries(Object.entries({
    'X-WWS-Municipality-Code': process.env.WWSRAPPORT_MUNICIPALITY_CODE,
    'X-WWS-Purpose-Code': process.env.WWSRAPPORT_PURPOSE_CODE,
    'X-WWS-Case-Reference': process.env.WWSRAPPORT_CASE_REFERENCE,
    'X-WWS-Client-Reference': process.env.WWSRAPPORT_CLIENT_REFERENCE,
  }).filter(([, value]) => value));
}

async function downloadDocument(reportId, type, output) {
  const endpoint = type === 'improvement-advice' ? 'improvement-advice' : 'wws-report';
  const response = await fetch(`${baseUrl}/reports/${encodeURIComponent(reportId)}/documents/${endpoint}`, {
    headers: {
      Accept: 'application/pdf, application/octet-stream',
      Authorization: `Bearer ${await bearerToken()}`,
      'X-WWSrapport-Client': '@wwsrapport/cli/0.3.0',
      ...contextHeaders(),
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
  wwsrapport verification WWS-2026-000038
  wwsrapport review rpt_... --file review.json --idempotency-key review-123
  wwsrapport batch:create --file batch.json --idempotency-key batch-123
  wwsrapport batch:get batch_...
  wwsrapport batch:retry batch_... --idempotency-key retry-123
  wwsrapport export:create --idempotency-key export-123
  wwsrapport export:get export_...
  wwsrapport offboarding:request --reference ZAAK-123
  wwsrapport registry:bag-reference 0123456789012345
  wwsrapport registry:search-by-bag 0123456789012345
  wwsrapport download rpt_... --type wws-report --output WWSrapport.pdf
  wwsrapport usage
  wwsrapport rulesets
  wwsrapport webhooks:list
  wwsrapport webhooks:test wh_...
`);
}
