const fs = require('node:fs'), path = require('node:path');
const suffix = process.argv[2]; if (!/^[a-z0-9-]+$/.test(suffix || '')) throw Error('SUFFIX_REQUIRED');
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-resume-gates-a03/identity.json')));
(async () => {
  const get = async endpoint => { const r = await fetch(identity.base + endpoint, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw Error('HTTP_' + r.status); return r.json(); };
  const messages = await get(`/session/${identity.session}/message`), statuses = await get('/session/status');
  const children = await get(`/session/${identity.session}/children`);
  const result = { utc: new Date().toISOString(), session: identity.session, status: statuses[identity.session], messages: messages.length,
    last: messages.slice(-2).map(message => ({ id: message.info.id, role: message.info.role, agent: message.info.agent, variant: message.info.variant,
      finish: message.info.finish, error_status: message.info.error?.data?.statusCode, tokens: message.info.tokens,
      parts: message.parts.map(part => ({ type: part.type, characters: part.text?.length, tool: part.tool, status: part.state?.status })) })),
    children: children.map(child => ({ id: child.id, title: child.title, status: statuses[child.id] })), inner_exit_code: 0 };
  fs.writeFileSync(path.join(__dirname, `native-progress-${suffix}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
})().catch(error => { console.error(String(error)); process.exitCode = 1; });
