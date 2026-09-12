/*
 * =============================================================================
 * k6 read-heavy smoke load test
 *
 *   k6 run load-test/test.js
 *   k6 run -e BASE_URL=https://dxxxx.cloudfront.net load-test/test.js
 *   k6 run -e PROFILE=soak load-test/test.js
 *
 * WHAT THIS IS: a check that the public read paths stay correct and reasonably
 * fast under a modest, realistic amount of concurrent browsing.
 *
 * WHAT THIS IS NOT: a stress test, a capacity benchmark, or a claim about how
 * much traffic the deployment can take. The target environment is ONE Fargate
 * task on 0.25 vCPU in front of a single-AZ db.t4g.micro. It is a development
 * and teaching environment and it is not intended for destructive stress
 * testing — pointing a few thousand virtual users at it proves nothing except
 * that small things are small.
 *
 * Only safe, idempotent GET endpoints are exercised. Application submissions
 * are deliberately excluded: they write rows, they consume the one-live-
 * application-per-candidate slot, and flooding a demo database with junk makes
 * the admin console useless for the next person who demonstrates it.
 * =============================================================================
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;
const PROFILE = __ENV.PROFILE || 'smoke';

const errorRate = new Rate('application_errors');
const jobListDuration = new Trend('job_list_duration', true);
const jobDetailDuration = new Trend('job_detail_duration', true);

/*
 * Three deliberately gentle profiles. Even "soak" holds at 10 virtual users —
 * enough to see caching, connection pooling and autoscaling behave, far short
 * of anything that would knock the demo over mid-presentation.
 */
const PROFILES = {
  smoke: {
    stages: [
      { duration: '30s', target: 3 },
      { duration: '1m', target: 3 },
      { duration: '15s', target: 0 },
    ],
  },
  load: {
    stages: [
      { duration: '1m', target: 10 },
      { duration: '3m', target: 10 },
      { duration: '1m', target: 20 },
      { duration: '1m', target: 0 },
    ],
  },
  soak: {
    stages: [
      { duration: '2m', target: 10 },
      { duration: '15m', target: 10 },
      { duration: '2m', target: 0 },
    ],
  },
};

export const options = {
  stages: PROFILES[PROFILE].stages,
  thresholds: {
    // A cold Fargate task and a t4g.micro database are not fast; these numbers
    // are honest for this size of environment, not aspirational.
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.02'],
    application_errors: ['rate<0.02'],
    job_list_duration: ['p(95)<1200'],
  },
  // Sends a recognisable UA so this traffic is identifiable in ALB logs.
  userAgent: 'mini-job-board-k6-load-test/1.0',
};

const SEARCH_TERMS = ['engineer', 'react', 'python', 'remote', 'analyst', ''];
const DEPARTMENTS = ['Engineering', 'Human Resources', 'Sales', 'Finance', ''];
const LOCATIONS = ['Bengaluru', 'Remote', 'Delhi NCR', ''];

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

export function setup() {
  // Fail fast and loudly if the target is not actually up, rather than
  // reporting a 100% error rate two minutes later.
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`Target is not healthy: GET ${BASE_URL}/health returned ${health.status}`);
  }

  const jobs = http.get(`${API}/jobs?page_size=20`);
  if (jobs.status !== 200) {
    throw new Error(`GET ${API}/jobs returned ${jobs.status}`);
  }

  const ids = jobs.json('items').map((job) => job.id);
  if (ids.length === 0) {
    throw new Error('No active jobs found. Seed the database before load testing.');
  }

  console.log(`Load testing ${BASE_URL} with profile "${PROFILE}" against ${ids.length} jobs`);
  return { jobIds: ids };
}

export default function (data) {
  group('careers page — filter options', () => {
    const response = http.get(`${API}/jobs/filters`, { tags: { name: 'filters' } });
    const ok = check(response, {
      'filters: 200': (r) => r.status === 200,
      'filters: has departments': (r) => Array.isArray(r.json('departments')),
    });
    errorRate.add(!ok);
  });

  group('careers page — browse and filter', () => {
    const params = new URLSearchParams({
      page: String(1 + Math.floor(Math.random() * 2)),
      page_size: '9',
    });
    const search = pick(SEARCH_TERMS);
    const department = pick(DEPARTMENTS);
    const location = pick(LOCATIONS);
    if (search) params.append('search', search);
    if (department) params.append('department', department);
    if (location) params.append('location', location);

    const response = http.get(`${API}/jobs?${params.toString()}`, { tags: { name: 'jobs list' } });
    jobListDuration.add(response.timings.duration);

    const ok = check(response, {
      'jobs: 200': (r) => r.status === 200,
      'jobs: pagination envelope': (r) => r.json('items') !== undefined && r.json('total') !== undefined,
      'jobs: only active jobs': (r) => (r.json('items') || []).every((job) => job.is_active === true),
    });
    errorRate.add(!ok);
  });

  sleep(1 + Math.random());

  group('job detail', () => {
    const jobId = data.jobIds[Math.floor(Math.random() * data.jobIds.length)];
    const response = http.get(`${API}/jobs/${jobId}`, { tags: { name: 'job detail' } });
    jobDetailDuration.add(response.timings.duration);

    const ok = check(response, {
      'detail: 200': (r) => r.status === 200,
      'detail: has a description': (r) => typeof r.json('description') === 'string',
      'detail: has a job code': (r) => typeof r.json('job_code') === 'string',
    });
    errorRate.add(!ok);
  });

  group('security — admin endpoints stay closed', () => {
    // Cheap, and it proves under load that the auth gate never accidentally
    // opens up.
    const response = http.get(`${API}/admin/stats`, { tags: { name: 'admin (expected 401)' } });
    const ok = check(response, { 'admin stats: 401 without a token': (r) => r.status === 401 });
    errorRate.add(!ok);
  });

  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  const p95 = Math.round(data.metrics.http_req_duration.values['p(95)']);
  const failed = (data.metrics.http_req_failed.values.rate * 100).toFixed(2);
  const requests = data.metrics.http_reqs.values.count;

  const summary = `
==========================================================
Mini Job Board Application Tracker — load test summary
==========================================================
  Target         ${BASE_URL}
  Profile        ${PROFILE}
  Requests       ${requests}
  Failed         ${failed}%
  p95 duration   ${p95} ms
==========================================================
  Reminder: this is a 1-task / db.t4g.micro development
  environment. These numbers describe THIS deployment and
  are not a capacity claim for the architecture.
==========================================================
`;

  return {
    stdout: summary,
    'load-test/summary.json': JSON.stringify(data, null, 2),
  };
}
