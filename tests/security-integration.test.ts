import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import worker from '../src/worker.ts';
import { createD1 } from '../dev/d1-sqlite.ts';
import { githubFixture } from './fixtures.ts';
import { getCommit } from '../src/lib/github.ts';

const savedFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== 'gh.test') return savedFetch(input, init);
  const [status, payload] = githubFixture(url.pathname + url.search);
  return new Response(JSON.stringify(payload), {status, headers:{'content-type':'application/json'}});
}) as typeof fetch;

const BASE = 'http://signal.test';
const makeEnv = () => ({
  DB: createD1(':memory:',join(process.cwd(),'migrations')),
  GITHUB_API_BASE: 'http://gh.test',
});
async function send(env: ReturnType<typeof makeEnv>, path:string, method = 'GET',
  form:Record<string,string|string[]> = {}, cookie = '') {
  const data = new URLSearchParams();
  for(const [key,value] of Object.entries(form)) {
    for(const item of Array.isArray(value) ? value : [value]) data.append(key,item);
  }
  return worker.fetch(new Request(BASE+path,{
    method,
    headers:{Origin:BASE,...(cookie?{Cookie:cookie}:{}),
      ...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
    ...(method==='POST'?{body:data.toString()}:{})
  }),env);
}
async function signupWithRepo(env:ReturnType<typeof makeEnv>, email = 'owner@example.com') {
  const signup = await send(env,'/signup','POST',{email,password:'long-enough-password'});
  assert.equal(signup.status,303);
  const cookie = signup.headers.get('Set-Cookie')!.split(';')[0]!;
  const connected = await send(env,'/app/repos','POST',{full_name:'acme/rocket'},cookie);
  assert.equal(connected.status,303);
  const repoPath = new URL(connected.headers.get('Location')!,BASE).pathname;
  return {cookie,repoPath};
}
test('raw GitHub credential cannot render or persist; generated signal blocks approval',async()=>{
  const env=makeEnv(), {cookie,repoPath}=await signupWithRepo(env);
  const page=await send(env,repoPath,'GET',{},cookie);
  assert.doesNotMatch(await page.text(),/ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab/);
  const result=await send(env,repoPath+'/generate','POST',{sha:'f'.repeat(40),channels:'x'},cookie);
  assert.equal(result.headers.get('Location'),'/app?ok=generated');
  const row=await env.DB.prepare('SELECT id,draft,five_w1h,decision,reasons FROM signals').first<{
    id:string;draft:string;five_w1h:string;decision:string;reasons:string
  }>();
  assert.ok(row);
  assert.equal(row.decision,'blocked');
  assert.match(row.reasons,/possible secret detected/);
  assert.doesNotMatch(row.draft+row.five_w1h,/ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab/);
  assert.match(row.draft,/\[redacted\]/);
  const approve=await send(env,'/app/signals/'+row.id+'/approve','POST',{},cookie);
  assert.match(approve.headers.get('Location')||'',/err=blocked/);
});
test('changed repo truth rules invalidate a stale draft approval',async()=>{
  const env=makeEnv(), {cookie,repoPath}=await signupWithRepo(env);
  await send(env,repoPath+'/generate','POST',{sha:'a'.repeat(40),channels:'x'},cookie);
  const row=await env.DB.prepare('SELECT id FROM signals').first<{id:string}>();
  assert.ok(row);
  await send(env,repoPath+'/rules','POST',{never_claim:'magic-link'},cookie);
  const res=await send(env,'/app/signals/'+row.id+'/approve','POST',{},cookie);
  assert.match(res.headers.get('Location')||'',/err=blocked/);
  const saved=await env.DB.prepare('SELECT status,decision FROM signals WHERE id=?').bind(row.id).first<{
    status:string;decision:string
  }>();
  assert.equal(saved?.status,'draft');
  assert.equal(saved?.decision,'blocked');
});
test('quota ledger persists after reconnecting a repo',async()=>{
  const env=makeEnv(), {cookie,repoPath}=await signupWithRepo(env);
  const user=await env.DB.prepare("SELECT id FROM users WHERE email = 'owner@example.com'").first<{id:string}>();
  const repo=await env.DB.prepare('SELECT id FROM repos WHERE user_id=?').bind(user!.id).first<{id:string}>();
  const now=new Date().toISOString();
  for(let i=0;i<30;i++){
    await env.DB.prepare(`INSERT INTO signals
      (id,user_id,repo_id,commit_sha,commit_url,channel,draft,five_w1h,decision,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'x','sample','{}','review','draft',?,?)`)
      .bind(crypto.randomUUID(),user!.id,repo!.id,String(i).padStart(40,'0'),
        'https://example.test',now,now).run();
  }
  const before=await env.DB.prepare('SELECT count(*) AS n FROM signal_usage_events WHERE user_id=?')
    .bind(user!.id).first<{n:number}>();
  assert.equal(before?.n,30);
  await send(env,repoPath+'/delete','POST',{},cookie);
  const after=await env.DB.prepare('SELECT count(*) AS n FROM signal_usage_events WHERE user_id=?')
    .bind(user!.id).first<{n:number}>();
  assert.equal(after?.n,30);
  const newRepo=await send(env,'/app/repos','POST',{full_name:'acme/second'},cookie);
  const path=new URL(newRepo.headers.get('Location')!,BASE).pathname;
  const denied=await send(env,path+'/generate','POST',{sha:'a'.repeat(40),channels:'x'},cookie);
  assert.match(denied.headers.get('Location')||'',/err=usage_limit/);
});
test('concurrent generation respects quota after 29 usage events',async()=>{
  const env=makeEnv(), {cookie,repoPath}=await signupWithRepo(env);
  const user=await env.DB.prepare("SELECT id FROM users WHERE email='owner@example.com'").first<{id:string}>();
  const repo=await env.DB.prepare('SELECT id FROM repos WHERE user_id=?').bind(user!.id).first<{id:string}>();
  const now=new Date().toISOString();
  for(let i=0;i<29;i++) {
    await env.DB.prepare(`INSERT INTO signals
      (id,user_id,repo_id,commit_sha,commit_url,channel,draft,five_w1h,decision,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'x','sample','{}','review','draft',?,?)`)
      .bind(crypto.randomUUID(),user!.id,repo!.id,String(i).padStart(40,'0'),
      'https://example.test',now,now).run();
  }
  await Promise.all([
    send(env,repoPath+'/generate','POST',{sha:'a'.repeat(40),channels:'x'},cookie),
    send(env,repoPath+'/generate','POST',{sha:'b'.repeat(40),channels:'x'},cookie),
  ]);
  const ledger=await env.DB.prepare('SELECT count(*) AS n FROM signal_usage_events WHERE user_id=?')
    .bind(user!.id).first<{n:number}>();
  assert.ok((ledger?.n??0)<=30);
});
test('private GitHub repos cannot be read even after prior connection',async()=>{
  const env=makeEnv();
  await assert.rejects(()=>getCommit(env,'acme/private-thing','a'.repeat(40)),(err:unknown)=>
    typeof err==='object' && err!==null && 'code' in err && err.code==='private');
});
test('blocked drafts never expose copy controls; new never-expose rule masks old content',async()=>{
  const env=makeEnv(), {cookie,repoPath}=await signupWithRepo(env);
  await send(env,repoPath+'/generate','POST',{sha:'a'.repeat(40),channels:'x'},cookie);
  await send(env,repoPath+'/rules','POST',{never_expose:'magic-link'},cookie);
  const dashboard=await send(env,'/app','GET',{},cookie);
  const markup=await dashboard.text();
  assert.doesNotMatch(markup,/magic-link/i);
  assert.doesNotMatch(markup,/data-copy=/);
});
test('tenant cannot approve another tenant\'s draft',async()=>{
  const env=makeEnv(), {cookie:ownerCookie,repoPath}=await signupWithRepo(env);
  await send(env,repoPath+'/generate','POST',{sha:'a'.repeat(40),channels:'x'},ownerCookie);
  const signal=await env.DB.prepare('SELECT id FROM signals').first<{id:string}>();
  assert.ok(signal);
  const other=await send(env,'/signup','POST',{email:'second@example.com',password:'long-enough-password'});
  const cookie=other.headers.get('Set-Cookie')!.split(';')[0]!;
  const denied=await send(env,'/app/signals/'+signal.id+'/approve','POST',{},cookie);
  assert.equal(denied.status,404);
  const row=await env.DB.prepare('SELECT status FROM signals WHERE id=?').bind(signal.id).first<{status:string}>();
  assert.equal(row?.status,'draft');
});
