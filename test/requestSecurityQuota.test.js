const test = require('node:test');
const assert = require('node:assert/strict');

const { newDb } = require('pg-mem');

const { applyUserActionQuota } = require('../src/security/requestSecurity');
const { TEMPLATE_LIBRARY_SCHEMA_SQL } = require('../src/storage/templateLibrarySchema');

test('applyUserActionQuota enforces the configured per-user fixed window limit', async () => {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();

  await pool.query(TEMPLATE_LIBRARY_SCHEMA_SQL);
  await pool.query(
    `INSERT INTO workspaces (workspace_id, display_name)
     VALUES ($1, $2)`,
    ['quota-workspace', 'Quota Workspace']
  );
  await pool.query(
    `INSERT INTO users (
       user_id,
       workspace_id,
       provider,
       provider_user_id,
       email,
       display_name,
       role
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['quota-user', 'quota-workspace', 'google', 'quota-user', 'quota@example.com', 'Quota User', 'user']
  );

  const policy = {
    action: 'generate',
    windowMs: 60 * 1000,
    windowMax: 2,
    dayMax: 10
  };
  const now = new Date('2026-03-21T12:00:15.000Z');

  try {
    const first = await applyUserActionQuota(pool, { userId: 'quota-user', policy, now });
    const second = await applyUserActionQuota(pool, { userId: 'quota-user', policy, now });
    const third = await applyUserActionQuota(pool, { userId: 'quota-user', policy, now });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(third.action, 'generate');
    assert.equal(third.period, 'window');
    assert.ok(third.retryAfterSeconds >= 1);
  } finally {
    await pool.end();
  }
});
