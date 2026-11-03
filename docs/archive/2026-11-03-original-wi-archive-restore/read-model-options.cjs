const fs = require('node:fs'), path = require('node:path');
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-resume/identity.json')));
(async () => {
  const p = await fetch(identity.base + '/provider'); if (!p.ok) throw Error('PROVIDER_READ_' + p.status);
  const providers = await p.json(), provider = providers.all.find(item => item.id === 'zhipuai-coding-plan'), model = provider?.models?.['glm-5.3'];
  const d = await fetch(identity.base + '/doc'); if (!d.ok) throw Error('DOC_READ_' + d.status);
  const doc = await d.json();
  const result = { utc: new Date().toISOString(), provider_connected: providers.connected.includes('zhipuai-coding-plan'),
    model: model ? { id: model.id, limit: model.limit, capabilities: model.capabilities, variants: model.variants } : null,
    message_request: doc.paths?.['/session/{sessionID}/message']?.post?.requestBody, inner_exit_code: 0 };
  fs.writeFileSync(path.join(__dirname, 'model-options.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; });
