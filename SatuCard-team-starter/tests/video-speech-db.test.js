import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('speech pilot creates no credit, denies browser roles and cannot overdraw concurrent reservations',async()=>{
  const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111';
  try{
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    await db.query('insert into auth.users values ($1)',[owner]);
    const migration=await readFile(new URL('../database/video-speech-pilot.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    assert.equal((await db.query('select count(*)::int as n from public.video_speech_allowance')).rows[0].n,0);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.video_speech_allowance'::regclass")).rows[0].relrowsecurity,true);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from public.video_speech_allowance'),/permission denied/);
      await assert.rejects(db.query('select public.reserve_video_speech($1)',[owner]),/permission denied/);
      await db.exec('reset role');
    }
    await assert.rejects(db.query('insert into public.video_speech_allowance values ($1,21)',[owner]),/check constraint/);
    await db.query('insert into public.video_speech_allowance values ($1,20)',[owner]);
    await db.exec('set role service_role');
    const reservations=await Promise.all(Array.from({length:30},()=>db.query('select public.reserve_video_speech($1) as reserved',[owner])));
    assert.equal(reservations.filter(result=>result.rows[0].reserved).length,20);
    await db.exec('reset role');
    assert.equal((await db.query('select requests_left from public.video_speech_allowance')).rows[0].requests_left,0);
  }finally{await db.close();}
});
