import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, DAY, cleanConfig, safeURL, allowed, viewportKey, learn, pruneModel, addTransition, rank, makePlan, reserve } from '../src/core.js';
const from = 'https://example.org/', to = 'https://example.org/story';
const config = cleanConfig({ ...DEFAULTS, mode: 'measured', allowedOrigins: ['https://example.org'] });
const viewport = '1200x800@1', now = 10 * DAY;
const profile = { url: to, viewport, documentBytes: 8000, resources: [{ url: 'https://example.org/a.css', kind: 'style', bytes: 1000 }, { url: 'https://example.org/hero.webp', kind: 'image', bytes: 12000 }] };
const model = () => learn({ pages: {}, edges: {} }, profile, config, now);

test('reject unsafe/sensitive URLs without rewriting them into another page', () => {
  for (const raw of ['javascript:alert(1)', 'http://example.org/', 'https://user:pass@example.org/', to + '?token=x', to + '#section', 'https://example.org/%6cogin', 'https://example.org/checkout', 'https://mail.example.org/', 'https://example.org/api/list', 'https://example.org/clip.mp4', 'https://10.0.0.1/', 'https://intranet/', 'https://example.local/', 'https://[::1]/', 'https://example.org/%00']) assert.equal(safeURL(raw), null, raw);
  assert.equal(safeURL(to), to);
  assert.equal(safeURL('http://localhost:1234/', { allowLoopback: true }), 'http://localhost:1234/');
  assert.equal(safeURL('http://localhost:1234/'), null);
  assert.equal(safeURL('https://cdn.example.org/a.css', { origin: 'https://example.org', document: false }), null);
});

test('default is no access and strict mode; configuration is bounded', () => {
  assert.equal(allowed(to, DEFAULTS), false);
  const c = cleanConfig({ pageRequests: 999, dayKiB: -1, allowedOrigins: ['bad', 'https://example.org', 'https://example.org'], exclusions: [' X ', null], enabled: 'yes' });
  assert.equal(c.mode, 'strict'); assert.equal(c.pageRequests, 4); assert.equal(c.dayKiB, 16);
  assert.deepEqual(c.allowedOrigins, ['https://example.org']); assert.deepEqual(c.exclusions, ['x']);
  assert.equal(allowed(to, { ...c, exclusions: ['/story'] }), false);
});

test('learn only known sizes, same-origin CSS and one hero image, with retention', () => {
  const p = { ...profile, resources: [...profile.resources, { url: 'https://elsewhere.org/b.css', kind: 'style', bytes: 10 }, { url: 'https://example.org/a.mp4', kind: 'video', bytes: 20 }, { url: 'https://example.org/disguised.mp4', kind: 'style', bytes: 20 }, { url: 'https://example.org/second.png', kind: 'image', bytes: 100 }] };
  const m = learn({ pages: {}, edges: {} }, p, config, now);
  assert.equal(m.pages[to].resources.length, 2);
  assert.deepEqual(learn(m, { ...p, documentBytes: 0 }, config, now), m);
  assert.equal(Object.keys(pruneModel(m, config, now + 8 * DAY).pages).length, 0);
  assert.equal(Object.keys(pruneModel(m, { ...config, allowedOrigins: [] }, now).pages).length, 0);
});

test('viewport, expiry, confidence and cold profile are admission gates', () => {
  const m = model();
  assert.equal(makePlan(m, from, to, '500x600@1', 'pointer', config, now), null);
  assert.equal(makePlan(m, from, to, viewport, 'pointer', config, now + 8 * DAY), null);
  assert.equal(makePlan(m, from, 'https://example.org/unknown', viewport, 'pointer', config, now), null);
  assert.equal(makePlan(m, from, to, viewport, 'prediction', config, now), null);
  assert.equal(makePlan(m, from, to, viewport, 'pointer', config, now).resources.length, 3);
  assert.equal(viewportKey(1199, 799, 1), viewport);
});

test('strict mode cannot produce a body-fetch plan', () => {
  const p = makePlan(model(), from, to, viewport, 'pointer', { ...config, mode: 'strict' }, now);
  assert.equal(p.estimatedBytes, 0); assert.equal(p.requests, 0); assert.deepEqual(p.resources, []);
});

test('local transitions decay and require repeated actual clicks for idle prediction', () => {
  let m = learn(model(), { ...profile, url: from }, config, now);
  for (let i = 0; i < 5; i++) m = addTransition(m, from, to, config, now);
  assert.ok(rank(m, from, to, 'prediction', now).confidence > .8);
  assert.ok(makePlan(m, from, to, viewport, 'prediction', config, now));
  assert.equal(makePlan(m, from, to, viewport, 'prediction', config, now + 6 * DAY), null);
});

test('reserves conservative sizes, shares budgets and never refunds/repeats a page', () => {
  const plan = makePlan(model(), from, to, viewport, 'pointer', config, now);
  assert.equal(plan.estimatedBytes, (8000 + 1000 + 12000) * 2 + 3 * 4096);
  const one = reserve({}, plan, 'a', config, now);
  assert.equal(one.ok, true);
  assert.equal(reserve(one.ledger, plan, 'a', config, now + 70000).ok, false);
  assert.equal(reserve(one.ledger, plan, 'b', config, now + 100).reason, 'cooldown');
  assert.equal(reserve(one.ledger, plan, 'b', { ...config, hourRequests: 3 }, now + 70000).reason, 'budget');
  assert.equal(reserve(one.ledger, plan, 'b', { ...config, dayRequests: 3 }, now + 3600001).reason, 'budget');
  assert.equal(reserve(one.ledger, plan, 'b', config, now + DAY + 1).ok, true);
});

test('oversized document and request/byte limits reject the excess', () => {
  const m = learn(model(), { ...profile, documentBytes: 1024 * 1024 }, config, now);
  assert.equal(makePlan(m, from, to, viewport, 'pointer', config, now), null);
  const plan = makePlan(model(), from, to, viewport, 'pointer', { ...config, pageRequests: 1 }, now);
  assert.equal(plan.resources.length, 1);
  assert.equal(reserve({}, plan, 'a', { ...config, hourKiB: 1 }, now).ok, false);
});

test('bounded local model cannot grow without limit', () => {
  let m = { pages: {}, edges: {} };
  for (let i = 0; i < 230; i++) m = learn(m, { ...profile, url: `https://example.org/story-${i}` }, config, now + i);
  assert.equal(Object.keys(m.pages).length, 200);
});
