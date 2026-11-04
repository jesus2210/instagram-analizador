import test from 'node:test';
import assert from 'node:assert/strict';
import { loginAccounts } from '../server/login-accounts.js';
const granted = ['instagram_basic','instagram_manage_insights','pages_show_list','pages_read_engagement'].map(permission=>({permission,status:'granted'}));

test('distinguishes no authorized Pages from Pages without accessible Instagram links',async()=>{
  for (const [pages, expected] of [[[], 'no-pages'], [[{id:'p1',name:'Test Page'}], 'no-linked-instagram']]) {
    const result = await loginAccounts('synthetic-token', async path=>path===''?Object.fromEntries(pages.map(p=>[p.id,{id:p.id}])):({data:path==='me/accounts'?pages:granted}));
    assert.equal(result.issue,expected);
    assert.equal(result.pageCount,pages.length);
    assert.deepEqual(result.accounts,[]);
  }
});
test('reports denied or absent permissions instead of asserting Instagram is unlinked',async()=>{
  const result=await loginAccounts('synthetic-token',async path=>({data:path==='me/accounts'?[]:[{permission:'pages_show_list',status:'declined'}]}));
  assert.equal(result.issue,'missing-permissions');
  assert.ok(result.missingPermissions.includes('pages_show_list'));
});
test('does not confuse an unavailable permissions inspection with a confirmed denial',async()=>{
  const result=await loginAccounts('synthetic-token',async path=>{
    if(path==='me/permissions')throw new Error('provider unavailable');
    return {data:[]};
  });
  assert.equal(result.issue,'no-pages');
  assert.equal(result.missingPermissions,null);
});
test('finds Instagram on a later Page result and never sends pagination URLs or tokens to clients',async()=>{
  let calls=0;
  const result=await loginAccounts('synthetic-private-token',async(path,params)=>{
    calls++;
    assert.equal(path,'me/accounts');
    if(!params.after)return {data:[{id:'p1',name:'Other Page'}],paging:{next:'https://graph.facebook.com/private',cursors:{after:'cursor1'}}};
    assert.equal(params.after,'cursor1');
    return {data:[{id:'p2',name:'New Page',instagram_business_account:{id:'ig2',username:'nutrition'}}]};
  });
  assert.equal(calls,2);
  assert.equal(result.issue,null);
  assert.equal(result.pageCount,2);
  assert.deepEqual(result.accounts,[{id:'ig2',username:'nutrition'}]);
  assert.ok(!JSON.stringify(result).includes('synthetic-private-token'));
  assert.ok(!JSON.stringify(result).includes('graph.facebook.com'));
});


test('finds an Instagram link through direct Page lookup when omitted by the connection',async()=>{
 const result=await loginAccounts('synthetic-private-token',async(path,params)=>{
  if(path==='me/accounts')return {data:[{id:'page1',name:'New Page'}]};
  assert.equal(path,'');
  assert.equal(params.ids,'page1');
  assert.equal(params.access_token,'synthetic-private-token');
  return {page1:{id:'page1',instagram_business_account:{id:'ig1',username:'nutrition'}}};
 });
 assert.equal(result.issue,null);
 assert.deepEqual(result.accounts,[{id:'ig1',username:'nutrition'}]);
 assert.ok(!JSON.stringify(result).includes('synthetic-private-token'));
});
test('does not claim Instagram is unlinked when direct Page lookup is denied',async()=>{
 const result=await loginAccounts('test',async(path)=>{
  if(path==='me/accounts')return {data:[{id:'page1',name:'New Page'}]};
  if(path==='')return {page1:{error:{code:200,message:'private-provider-detail'}}};
  return {data:granted};
 });
 assert.equal(result.issue,'page-lookup-failed');
 assert.equal(result.failedPageLookups,1);
 assert.ok(!JSON.stringify(result).includes('private-provider-detail'));
});
test('does not claim all links were checked beyond the explicit 50 Page lookup limit',async()=>{
 const pages=Array.from({length:51},(_,i)=>({id:'p'+i,name:'Page'}));
 const result=await loginAccounts('test',async(path,params)=>{
  if(path==='me/accounts')return {data:pages};
  if(path===''){
   assert.equal(params.ids.split(',').length,50);
   return Object.fromEntries(pages.slice(0,50).map(p=>[p.id,{id:p.id}]));
  }
  return {data:granted};
 });
 assert.equal(result.issue,'page-lookup-incomplete');
});

const grantOptions = { appAccessToken: '123|synthetic-app-secret', expectedAppId: '123' };
const authorizedScopes = granted.map(p => p.permission);
test('uses the specifically granted IG account when Meta returns no Pages', async () => {
 const igId = '17841400000000001';
 const result = await loginAccounts('synthetic-user-token', async(path,params) => {
  if(path==='me/accounts') return {data:[]};
  if(path==='debug_token') {
   assert.equal(params.input_token,'synthetic-user-token');
   assert.equal(params.access_token,grantOptions.appAccessToken);
   return {data:{is_valid:true,app_id:'123',scopes:authorizedScopes,granular_scopes:[{scope:'instagram_basic',target_ids:[igId]}]}};
  }
  assert.equal(path,igId);
  assert.equal(params.access_token,'synthetic-user-token');
  return {id:igId,username:'nutrition',media_count:12};
 },grantOptions);
 assert.equal(result.issue,null);
 assert.deepEqual(result.accounts,[{id:igId,username:'nutrition'}]);
 assert.equal(result.listedPageCount,0);
 assert.ok(!JSON.stringify(result).includes('synthetic-'));
});
test('recovers an authorized Page from granular grants and verifies its Instagram link',async()=>{
 const pageId='1390000000000001';
 const result=await loginAccounts('test',async(path,params)=>{
  if(path==='me/accounts')return {data:[]};
  if(path==='debug_token')return {data:{is_valid:true,app_id:'123',scopes:authorizedScopes,granular_scopes:[{scope:'pages_show_list',target_ids:[pageId]}]}};
  assert.equal(path,''); assert.equal(params.ids,pageId);
  return {[pageId]:{instagram_business_account:{id:'17841400000000001',username:'nutrition'}}};
 },grantOptions);
 assert.equal(result.issue,null);
 assert.equal(result.pageCount,1);assert.equal(result.listedPageCount,0);
 assert.equal(result.accounts[0].username,'nutrition');
});
test('does not trust grants from another app or an invalid token',async()=>{
 for(const data of [{is_valid:true,app_id:'other'}, {is_valid:false,app_id:'123'}]){
  const result=await loginAccounts('test',async path=>{
   if(path==='debug_token')return {data:{...data,scopes:authorizedScopes,granular_scopes:[{scope:'instagram_basic',target_ids:['17841400000000001']}]}};
   assert.ok(['me/accounts','me/permissions'].includes(path));
   return {data:path==='me/accounts'?[]:granted};
  },grantOptions);
  assert.equal(result.issue,'grant-inspection-failed'); assert.deepEqual(result.accounts,[]);
 }
});
test('does not accept an arbitrary granted ID as an Instagram user without verifying the object',async()=>{
 const result=await loginAccounts('test',async path=>{
  if(path==='debug_token')return {data:{is_valid:true,app_id:'123',scopes:authorizedScopes,granular_scopes:[{scope:'instagram_basic',target_ids:['17841400000000001']}]}};
  if(path==='17841400000000001')return {id:path,username:'not-an-ig-object'};
  return {data:path==='me/accounts'?[]:granted};
 },grantOptions);
 assert.deepEqual(result.accounts,[]);
});

test('accepts safely represented numeric Page targets without rounding identifiers',async()=>{
 const id=1390000000000001;
 const result=await loginAccounts('test',async(path,params)=>{
  if(path==='me/accounts')return {data:[]};
  if(path==='debug_token')return {data:{is_valid:true,app_id:'123',scopes:authorizedScopes,granular_scopes:[{scope:'pages_show_list',target_ids:[id]}]}};
  assert.equal(path,'');assert.equal(params.ids,String(id));
  return {[String(id)]:{instagram_business_account:{id:'17841400000000001',username:'nutrition'}}};
 },grantOptions);
 assert.equal(result.issue,null);
});
test('rejects an unsafe numeric target instead of querying a rounded account ID',async()=>{
 const result=await loginAccounts('test',async path=>{
  if(path==='debug_token')return {data:{is_valid:true,app_id:'123',scopes:authorizedScopes,granular_scopes:[{scope:'instagram_basic',target_ids:[Number.MAX_SAFE_INTEGER+2]}]}};
  assert.ok(['me/accounts','me/permissions'].includes(path));
  return {data:path==='me/accounts'?[]:granted};
 },grantOptions);
 assert.deepEqual(result.accounts,[]);assert.equal(result.issue,'grant-inspection-failed');
});
