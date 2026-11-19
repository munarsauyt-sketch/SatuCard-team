import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('free templates migration rejects old orders, preserves payments and removes subscription delays idempotently', async () => {
  const db = new PGlite();
  const user = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);');
    await db.query('insert into auth.users values($1,$2)', [user, 'buyer@example.test']);
    await db.exec(await readFile(new URL('../database/paid-access.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../database/pricing-v2-upgrade.sql', import.meta.url), 'utf8'));
    await db.query('insert into public.billing_accounts(user_id) values($1)', [user]);
    const old = (await db.query("insert into public.billing_orders(user_id,request_id,plan_id,amount_kzt,token_limit,tier,duration_days,status,payment_ref) values($1,gen_random_uuid(),'niche10',490,1,1,30,'confirmed','keep-payment-evidence') returning id", [user])).rows[0];
    await db.query("insert into public.billing_grants(user_id,order_id,plan_id,tier,token_limit,starts_at,expires_at) values($1,$2,'niche10',1,1,clock_timestamp()-interval '1 day',clock_timestamp()+interval '29 days')", [user, old.id]);
    const rpc = async (name, args) => (await db.query('select public.' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') as r', args)).rows[0].r;
    const order = (await rpc('create_billing_order', [user, 'basic', '22222222-2222-4222-8222-222222222222'])).order;
    await rpc('confirm_billing_order', [order.id, user, 'basic-payment', 1500]);
    const pending = (await db.query("insert into public.billing_orders(user_id,request_id,plan_id,amount_kzt,token_limit,tier,duration_days) values($1,gen_random_uuid(),'niche10',490,1,1,30) returning id", [user])).rows[0];
    const migration = await readFile(new URL('../database/free-templates-upgrade.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const grant = (await db.query("select * from public.billing_grants where plan_id='basic'")).rows[0];
    assert.ok(Math.abs(Date.now() - Date.parse(grant.starts_at)) < 10000);
    assert.equal((Date.parse(grant.expires_at) - Date.parse(grant.starts_at)) / 86400000, 30);
    assert.equal((await db.query('select payment_ref from public.billing_orders where id=$1', [old.id])).rows[0].payment_ref, 'keep-payment-evidence');
    assert.equal((await db.query('select status from public.billing_orders where id=$1', [pending.id])).rows[0].status, 'cancelled');
    await assert.rejects(rpc('create_billing_order', [user, 'niche10', '33333333-3333-4333-8333-333333333333']));
    await assert.rejects(rpc('confirm_billing_order', [pending.id, user, 'not-a-product', 490]));
    await db.exec(migration);
    assert.equal(Date.parse((await db.query('select starts_at from public.billing_grants where id=$1', [grant.id])).rows[0].starts_at), Date.parse(grant.starts_at));
    assert.equal((await db.query('select count(*)::int as n from public.billing_schedule_repairs')).rows[0].n, 1);
  } finally { await db.close(); }
});
