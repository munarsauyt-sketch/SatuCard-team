import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('publication journal is repeatable, private and can track an upload before card metadata exists', async () => {
  const db = new PGlite();
  const id = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
    await db.query('insert into auth.users values($1)', [id]);
    const migration = await readFile(new URL('../database/publication-uploads.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from public.card_publication_uploads'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await db.query('insert into public.card_publication_uploads(image_path,card_id,user_id) values($1,$2,$3)', [id + '.jpg', id, id]);
    assert.equal((await db.query('select * from public.card_publication_uploads')).rows.length, 1);
    await assert.rejects(db.query('insert into public.card_publication_uploads(image_path,card_id,user_id) values($1,$2,$3)', ['../private.jpg', id, id]), /check constraint/);
    await db.query('delete from public.card_publication_uploads where card_id=$1', [id]);
    assert.equal((await db.query('select * from public.card_publication_uploads')).rows.length, 0);
  } finally { await db.close(); }
});
