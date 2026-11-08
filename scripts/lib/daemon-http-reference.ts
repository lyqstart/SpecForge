import ts from 'typescript';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {CONTROLLED_HTTP_TOOLS} from '../../packages/daemon-core/src/tools/lib/controlled-http-tools';
export function collectDaemonHttpReference(root:string){
 const source=ts.createSourceFile('HTTPServer.ts',readFileSync(path.join(root,'packages/daemon-core/src/http/HTTPServer.ts'),'utf8'),ts.ScriptTarget.Latest,true);
 const routes:{method:string;path:string;handler:string}[]=[],codes=new Map<string,Set<string>>();
 function owner(n:ts.Node){let p=n.parent;while(p&&!ts.isMethodDeclaration(p))p=p.parent;return p&&ts.isMethodDeclaration(p)?p.name.getText(source):'unknown';}
 const value=(n:ts.Expression|undefined):string=>{
  if(n&&ts.isStringLiteralLike(n))return n.text;
  if(n&&ts.isPropertyAccessExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(source)==='CONTROLLED_HTTP_TOOLS')return String(Reflect.get(Reflect.get(CONTROLLED_HTTP_TOOLS,n.expression.name.text)??{},n.name.text)??'');
  return '';
 };
 const visit=(n:ts.Node)=>{
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
   if(n.expression.name.text==='addExactRoute'){
    const method=value(n.arguments[0]),route=value(n.arguments[1]);if(!method||!route)throw Error('HTTP_ROUTE_REFERENCE_UNRESOLVED');
    const expression=n.arguments[2];const handler=expression&&ts.isCallExpression(expression)&&ts.isPropertyAccessExpression(expression.expression)&&ts.isPropertyAccessExpression(expression.expression.expression)?expression.expression.expression.name.text:'unknown';
    routes.push({method,path:route,handler});
   }
   if(n.expression.name.text==='errorBody'){const code=value(n.arguments[0]);if(code){if(!codes.has(code))codes.set(code,new Set());codes.get(code)!.add(owner(n));}}
  }ts.forEachChild(n,visit);
 };visit(source);
 if(!routes.length||new Set(routes.map(r=>r.method+' '+r.path)).size!==routes.length)throw Error('HTTP_ROUTE_REFERENCE_INVALID');
 return {routes:routes.sort((a,b)=>(a.path+' '+a.method).localeCompare(b.path+' '+b.method)),codes:[...codes].sort(([a],[b])=>a.localeCompare(b)).map(([code,owners])=>({code,owners:[...owners].sort()}))};
}
export function renderDaemonHttpReferences(root:string){
 const {routes,codes}=collectDaemonHttpReference(root);
 return {
  'packages/daemon-core/docs/http-endpoints.md':`# Current Daemon HTTP routes\n\nDerived from [HTTPServer](../src/http/HTTPServer.ts) and the controlled HTTP tool registry. Regenerate with \`bun scripts/render-daemon-http-reference.ts\`; check with \`--check\`. Product authority remains [SPS](../../../docs/product-specification/specforge-product-specification.md).\n\nOnly GET /health and GET /api/v1/healthz are public. Every other listed endpoint requires bearer authentication from the private current handshake. Do not publish tokens or assume that authentication bypasses controlled handler permissions.\n\nRegistration is not implementation: event/query returns 501 / EVENT_QUERY_UNSUPPORTED; cas/store and cas/retrieve return 501 / CAS_API_UNSUPPORTED. They cannot be used as an independent query/CAS product API. Actual platform acceptance checks these refusals.\n\n| Method | Exact route | Handler owner |\n| --- | --- | --- |\n${routes.map(r=>`| ${r.method} | \`${r.path}\` | \`${r.handler}\` |`).join('\n')}\n\nThis table is the exact registered route surface. Dynamic dispatch fallback does not establish an additional supported API. Legacy session/create, status, daemon/stop and standalone workflow routes must not be used as current operating examples. Use the installed short CLI for Daemon lifecycle.\n\nProject Init and archive recovery retain their own controlled contracts; archive recovery is authenticated operator recovery, deliberately absent from Agent tool registries. Generic tool invocation must obey ToolDispatcher actor, artifact, permission, Gate and Runtime checks. Use the real tool schema rather than inventing request fields.\n\nResponse shapes vary by endpoint: common helpers use success/data or success/error plus requestId/timestamp; controlled tools return their own contracts. Public health is a direct health object. See [authentication](authentication.md) and [error handling](error-handling.md).\n`,
  'packages/daemon-core/docs/error-codes.md':`# Current HTTP error-code reference\n\nGenerated from literal \`errorBody\` calls in [HTTPServer](../src/http/HTTPServer.ts). This finite list covers that helper's static codes. Controlled Tool/Runtime/verification owners have additional typed errors; absence from this table does not make an error unknown or retryable.\n\n| Code | Producer method(s) |\n| --- | --- |\n${codes.map(c=>`| \`${c.code}\` | ${c.owners.map(o=>'\`'+o+'\`').join(', ')} |`).join('\n')}\n\nPreserve the exact code, numeric HTTP/command status, request identity, relevant release and sanitized details. A human message or transport success cannot replace a controlled result. Do not log tokens, credentials or raw configuration.\n\nAuthentication failures require the current Daemon/client owner; invalid input/schema requires correction through its artifact/configuration owner; permission/HardStop/Gate/verification failures retain their evidence and legal recovery conditions. Never edit truth sources, grant yourself permissions, fabricate receipts or retry a completed mutation. See [error handling](error-handling.md).\n\nRegenerate with \`bun scripts/render-daemon-http-reference.ts\`; CI/test checking uses \`--check\`.\n`,
 };
}
