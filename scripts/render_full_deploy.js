'use strict';

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const API_BASE = process.env.RENDER_API_BASE || 'https://api.render.com/v1';
const API_KEY = process.env.RENDER_API_KEY || process.env.RENDER_TOKEN || '';

const OWNER_ID = process.env.RENDER_OWNER_ID || '';
const REPO_URL = process.env.RENDER_REPO_URL || process.env.GIT_REPO_URL || 'https://github.com/Sandylamture03/ipl-predictor-2026.git';
const BRANCH = process.env.RENDER_REPO_BRANCH || process.env.GIT_BRANCH || 'main';

const DOMAIN_ROOT = process.env.DOMAIN_ROOT || 'ai-developer.in';
const WEB_DOMAIN = process.env.WEB_DOMAIN || DOMAIN_ROOT;
const WEB_WWW_DOMAIN = process.env.WEB_WWW_DOMAIN || `www.${DOMAIN_ROOT}`;
const API_DOMAIN = process.env.API_DOMAIN || `api.${DOMAIN_ROOT}`;
const ML_DOMAIN = process.env.ML_DOMAIN || `ml.${DOMAIN_ROOT}`;
const ENABLE_ML_PUBLIC_DOMAIN = String(process.env.ENABLE_ML_PUBLIC_DOMAIN || '0') === '1';

const DATABASE_URL = process.env.RENDER_DATABASE_URL || process.env.DATABASE_URL || '';
const CRICKET_API_KEY = process.env.RENDER_CRICKET_API_KEY || process.env.CRICKET_API_KEY || '';
const CRICKET_API_URL = process.env.RENDER_CRICKET_API_URL || process.env.CRICKET_API_URL || 'https://api.cricapi.com/v1';
const IPL_SEASON = process.env.IPL_SEASON || '2026';

if (!API_KEY) {
  console.error('ERROR: RENDER_API_KEY (or RENDER_TOKEN) is required.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL (or RENDER_DATABASE_URL) is required.');
  process.exit(1);
}

if (!CRICKET_API_KEY) {
  console.error('ERROR: CRICKET_API_KEY (or RENDER_CRICKET_API_KEY) is required.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function api(method, route, { query, body, allow404 = false } = {}) {
  const url = new URL(`${API_BASE}${route}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (allow404 && res.status === 404) return null;

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const err = new Error(`Render API ${method} ${route} failed: ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

function unwrapServiceItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => item?.service || item).filter(Boolean);
}

function normalizeService(serviceLike) {
  if (!serviceLike) return null;
  return serviceLike.service || serviceLike;
}

function unwrapOwnerItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => item?.owner || item).filter(Boolean);
}

async function resolveOwnerId() {
  if (OWNER_ID) return OWNER_ID;
  const owners = unwrapOwnerItems(await api('GET', '/owners'));
  if (owners.length === 0) {
    throw new Error('No Render owners/workspaces found for the API token.');
  }
  const team = owners.find((o) => o.type === 'team');
  const chosen = team || owners[0];
  console.log(`Using owner/workspace: ${chosen.name} (${chosen.id})`);
  return chosen.id;
}

async function findService(ownerId, name) {
  const services = unwrapServiceItems(
    await api('GET', '/services', { query: { ownerId, name, limit: 50 } })
  );
  return services.find((s) => s.name === name) || null;
}

async function getService(serviceId) {
  return api('GET', `/services/${serviceId}`);
}

async function createService(payload) {
  return api('POST', '/services', { body: payload });
}

async function patchService(serviceId, payload) {
  return api('PATCH', `/services/${serviceId}`, { body: payload });
}

async function upsertService(ownerId, def) {
  const existing = await findService(ownerId, def.name);
  if (!existing) {
    console.log(`Creating service: ${def.name}`);
    const created = await createService(def.createPayload(ownerId));
    return normalizeService(created);
  }

  if (existing.type !== def.type) {
    throw new Error(`Service ${def.name} exists with type ${existing.type}; expected ${def.type}`);
  }

  console.log(`Updating service: ${def.name}`);
  await patchService(existing.id, def.patchPayload());
  return normalizeService(await getService(existing.id));
}

async function upsertEnvVar(serviceId, key, value) {
  await api('PUT', `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, {
    body: { value: String(value) },
  });
}

async function upsertEnvVars(serviceId, envMap) {
  for (const [key, value] of Object.entries(envMap)) {
    await upsertEnvVar(serviceId, key, value);
  }
}

async function putStaticRoutes(serviceId) {
  await api('PUT', `/services/${serviceId}/routes`, {
    body: [{ type: 'rewrite', source: '/*', destination: '/index.html' }],
  });
}

async function listCustomDomains(serviceId) {
  const rows = await api('GET', `/services/${serviceId}/custom-domains`);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => row?.customDomain || row).filter(Boolean);
}

async function ensureCustomDomain(serviceId, domainName) {
  const existing = await listCustomDomains(serviceId);
  if (existing.some((d) => d.name === domainName)) {
    return existing.find((d) => d.name === domainName);
  }

  try {
    const created = await api('POST', `/services/${serviceId}/custom-domains`, {
      body: { name: domainName },
    });
    if (Array.isArray(created) && created[0]) return created[0];
    return created;
  } catch (err) {
    if (err.status === 409) {
      const rows = await listCustomDomains(serviceId);
      return rows.find((d) => d.name === domainName) || null;
    }
    throw err;
  }
}

async function verifyCustomDomain(serviceId, domainName) {
  try {
    await api('POST', `/services/${serviceId}/custom-domains/${encodeURIComponent(domainName)}/verify`);
  } catch (err) {
    if (err.status === 409 || err.status === 404) return;
    throw err;
  }
}

async function triggerDeploy(serviceId) {
  await api('POST', `/services/${serviceId}/deploys`, {
    body: { clearCache: 'do_not_clear' },
  });
}

function serviceDefs() {
  return [
    {
      name: 'ipl-web',
      type: 'static_site',
      createPayload: (ownerId) => ({
        type: 'static_site',
        name: 'ipl-web',
        ownerId,
        repo: REPO_URL,
        branch: BRANCH,
        autoDeploy: 'yes',
        rootDir: 'apps/web',
        serviceDetails: {
          buildCommand: 'npm install && npm run build',
          publishPath: 'dist',
          previews: { generation: 'off' },
        },
      }),
      patchPayload: () => ({
        repo: REPO_URL,
        branch: BRANCH,
        autoDeploy: 'yes',
        rootDir: 'apps/web',
        serviceDetails: {
          buildCommand: 'npm install && npm run build',
          publishPath: 'dist',
          previews: { generation: 'off' },
        },
      }),
    },
    {
      name: 'ipl-api',
      type: 'web_service',
      createPayload: (ownerId) => ({
        type: 'web_service',
        name: 'ipl-api',
        ownerId,
        repo: REPO_URL,
        branch: BRANCH,
        autoDeploy: 'yes',
        rootDir: 'apps/api',
        serviceDetails: {
          runtime: 'node',
          plan: 'free',
          region: 'oregon',
          envSpecificDetails: {
            buildCommand: 'npm install --include=dev && npm run build',
            startCommand: 'npm start',
          },
          healthCheckPath: '/api/health',
          previews: { generation: 'off' },
        },
      }),
      patchPayload: () => ({
        repo: REPO_URL,
        branch: BRANCH,
        autoDeploy: 'yes',
        rootDir: 'apps/api',
        serviceDetails: {
          runtime: 'node',
          plan: 'free',
          region: 'oregon',
          envSpecificDetails: {
            buildCommand: 'npm install --include=dev && npm run build',
            startCommand: 'npm start',
          },
          healthCheckPath: '/api/health',
          previews: { generation: 'off' },
        },
      }),
    },
    {
      name: 'ipl-ml',
      type: 'web_service',
      createPayload: (ownerId) => ({
        type: 'web_service',
        name: 'ipl-ml',
        ownerId,
        repo: REPO_URL,
        branch: BRANCH,
        autoDeploy: 'yes',
        rootDir: 'services/ml',
        serviceDetails: {
          runtime: 'python',
          plan: 'free',
          region: 'oregon',
          envSpecificDetails: {
            buildCommand: 'pip install -r requirements.txt',
            startCommand: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
          },
          healthCheckPath: '/health',
          previews: { generation: 'off' },
        },
      }),
      patchPayload: () => ({
        repo: REPO_URL,
        branch: BRANCH,
        autoDeploy: 'yes',
        rootDir: 'services/ml',
        serviceDetails: {
          runtime: 'python',
          plan: 'free',
          region: 'oregon',
          envSpecificDetails: {
            buildCommand: 'pip install -r requirements.txt',
            startCommand: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
          },
          healthCheckPath: '/health',
          previews: { generation: 'off' },
        },
      }),
    },
  ];
}

function serviceUrl(service) {
  return service?.serviceDetails?.url || '';
}

async function run() {
  const ownerId = await resolveOwnerId();
  const defs = serviceDefs();

  const createdOrUpdated = {};
  for (const def of defs) {
    const svc = await upsertService(ownerId, def);
    createdOrUpdated[def.name] = svc;
  }

  const web = createdOrUpdated['ipl-web'];
  const apiSvc = createdOrUpdated['ipl-api'];
  const ml = createdOrUpdated['ipl-ml'];

  await putStaticRoutes(web.id);

  const mlUrl = serviceUrl(ml);
  await upsertEnvVars(apiSvc.id, {
    NODE_ENV: 'production',
    DATABASE_URL,
    CRICKET_API_KEY,
    CRICKET_API_URL,
    ML_SERVICE_URL: mlUrl,
    CORS_ORIGINS: `https://${WEB_DOMAIN},https://${WEB_WWW_DOMAIN}`,
    IPL_SEASON,
  });

  await upsertEnvVars(ml.id, {
    DATABASE_URL,
    AUTO_TRAIN_PREMATCH: '1',
    IPL_SEASON,
    PYTHON_VERSION: '3.11.9',
  });

  await upsertEnvVars(web.id, {
    VITE_API_URL: `https://${API_DOMAIN}`,
  });

  const webDomains = [WEB_DOMAIN, WEB_WWW_DOMAIN];
  for (const d of webDomains) {
    await ensureCustomDomain(web.id, d);
    await verifyCustomDomain(web.id, d);
  }

  await ensureCustomDomain(apiSvc.id, API_DOMAIN);
  await verifyCustomDomain(apiSvc.id, API_DOMAIN);

  if (ENABLE_ML_PUBLIC_DOMAIN) {
    await ensureCustomDomain(ml.id, ML_DOMAIN);
    await verifyCustomDomain(ml.id, ML_DOMAIN);
  }

  await triggerDeploy(web.id);
  await triggerDeploy(apiSvc.id);
  await triggerDeploy(ml.id);

  console.log('\nDeployment automation submitted successfully.\n');
  console.log('Services:');
  console.log(`- ipl-web: ${serviceUrl(web)} (${web.dashboardUrl})`);
  console.log(`- ipl-api: ${serviceUrl(apiSvc)} (${apiSvc.dashboardUrl})`);
  console.log(`- ipl-ml:  ${serviceUrl(ml)} (${ml.dashboardUrl})`);

  console.log('\nCustom domains queued for verification:');
  console.log(`- web: https://${WEB_DOMAIN}`);
  console.log(`- web: https://${WEB_WWW_DOMAIN}`);
  console.log(`- api: https://${API_DOMAIN}`);
  if (ENABLE_ML_PUBLIC_DOMAIN) console.log(`- ml:  https://${ML_DOMAIN}`);

  console.log('\nHostinger DNS records needed:');
  console.log(`- A     @    216.24.57.1`);
  console.log(`- CNAME www  ${new URL(serviceUrl(web)).host}`);
  console.log(`- CNAME api  ${new URL(serviceUrl(apiSvc)).host}`);
  if (ENABLE_ML_PUBLIC_DOMAIN) {
    console.log(`- CNAME ml   ${new URL(serviceUrl(ml)).host}`);
  }
}

run().catch((err) => {
  const status = err.status ? ` status=${err.status}` : '';
  console.error(`Deploy automation failed:${status} ${err.message}`);
  if (err.payload) {
    try {
      console.error(JSON.stringify(err.payload, null, 2));
    } catch {
      console.error(String(err.payload));
    }
  }
  process.exit(1);
});
