const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const suffix = process.argv[2]; if (!/^[a-z0-9-]+$/.test(suffix || '')) throw Error('suffix required');
const root = path.join(__dirname, 'native-resume'), identity = JSON.parse(fs.readFileSync(path.join(root, 'identity.json')));
const baseline = new Set(JSON.parse(fs.readFileSync(path.join(root, 'baseline.json'))).message_ids);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(authorization|token|cookie|set-cookie|api_key|apiKey|access_token)$/i.test(key) ? '[REDACTED]' : sanitize(item)]));
  if (result.type === 'tool' && result.tool === 'read' && /host-profile\.json$/.test(result.state?.input?.filePath || '') && result.state?.output) {
    result.state.output_sha256 = hash(result.state.output); result.state.output = '[Host inventory redacted]';
  }
  return result;
}
function print(value) {
  const concise = Array.isArray(value) ? value.slice(-2) : { ...value,
    recent_child_sessions: value.recent_child_sessions?.map(child => ({ session: child.session, title: child.title,
      last_info: { role: child.last_info?.role, agent: child.last_info?.agent, variant: child.last_info?.variant, finish: child.last_info?.finish, error_code: child.last_info?.error?.data?.statusCode },
      part_sizes: child.part_sizes, messages: child.messages, tools: child.tools })) };
  console.log(JSON.stringify(sanitize(concise), null, 2));
}
(async () => {
  const response = await fetch(`${identity.base}/session/${identity.session}/message`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('HTTP_' + response.status);
  const messages = (await response.json()).filter(message => !baseline.has(message.info?.id));
  const since = Date.parse(JSON.parse(fs.readFileSync(path.join(root, 'request.json'))).utc);
  const childrenResponse = await fetch(`${identity.base}/session/${identity.session}/children`);
  if (!childrenResponse.ok) throw Error('CHILDREN_HTTP_' + childrenResponse.status);
  const children = await childrenResponse.json(), childMessages = [];
  const statusResponse = await fetch(`${identity.base}/session/status`);
  if (!statusResponse.ok) throw Error('STATUS_HTTP_' + statusResponse.status);
  const allStatuses = await statusResponse.json();
  const statuses = Object.fromEntries([identity.session, ...children.map(child => child.id)].filter(id => allStatuses[id]).map(id => [id, allStatuses[id]]));
  for (const child of children) {
    const r = await fetch(`${identity.base}/session/${child.id}/message`);
    if (!r.ok) throw Error('CHILD_MESSAGES_HTTP_' + r.status);
    const recent = (await r.json()).filter(message => (message.info?.time?.created || 0) >= since);
    if (recent.length) childMessages.push({ session: child.id, title: child.title, messages: recent });
  }
  fs.writeFileSync(path.join(root, `inspection-${suffix}.json`), JSON.stringify({ utc: new Date().toISOString(), source: identity.base, statuses, messages: sanitize(messages), childMessages: sanitize(childMessages) }, null, 2), { flag: 'wx' });
  print({ statuses, recent_child_sessions: childMessages.map(child => ({ session: child.session, title: child.title,
    last_info: sanitize(child.messages.filter(message => message.info?.role === 'assistant').at(-1)?.info), part_sizes: child.messages.filter(message => message.info?.role === 'assistant').at(-1)?.parts?.map(part => ({ type: part.type, text_length: part.text?.length })),
    messages: child.messages.length, tools: child.messages.flatMap(message => message.parts || []).filter(part => part.type === 'tool').slice(-3).map(part => ({ tool: part.tool, status: part.state?.status, error: part.state?.error, output: part.tool?.startsWith('sf_') ? String(part.state?.output || '').slice(-900) : undefined })) })) });
  print(messages.map(message => ({ id: message.info?.id, role: message.info?.role, error: message.info?.error,
    tools: message.parts?.filter(part => part.type === 'tool').map(part => ({ tool: part.tool, status: part.state?.status,
      error: part.state?.error, output: part.tool?.startsWith('sf_') ? String(part.state?.output || '').slice(-1200) : undefined })),
    text: message.parts?.filter(part => part.type === 'text').map(part => part.text).join('\n').slice(-2500) })));
})().catch(error => { console.error(error); process.exitCode = 1; });
