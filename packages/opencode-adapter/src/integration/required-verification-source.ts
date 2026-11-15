import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseRequiredVerificationDeclaration } from '@specforge/types/required-verification-contract';
import type {
  RequiredVerificationSourceRequest,
  RequiredVerificationSourceProof,
} from '@specforge/types/trusted-tool-invocation';

type RecordValue = Record<string, any>;
const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const requireValue = (value: unknown, code: string): void => {
  if (!value) throw new Error(`REQUIRED_VERIFICATION_SOURCE_${code}`);
};
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(k => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  if (
    value === null ||
    ['string', 'boolean'].includes(typeof value) ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  throw new Error('REQUIRED_VERIFICATION_SOURCE_NON_JSON');
};

/** Follow the actual live delegation chain, never a caller-supplied parent/user identity. */
export async function readRequiredVerificationSource(
  input: RequiredVerificationSourceRequest,
  get: (route: string) => Promise<unknown>
): Promise<RequiredVerificationSourceProof> {
  requireValue(
    /^ses_[A-Za-z0-9]+$/.test(input['sessionId']) &&
      Boolean(input.callId) &&
      path.isAbsolute(input['directory']),
    'IDENTITY'
  );
  const query = '?directory=' + encodeURIComponent(input['directory']);
  const sameDirectory = (value: string) => {
    const a = path.resolve(value),
      b = path.resolve(input['directory']);
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  };
  const load = async (sessionId: string) => {
    const session = await get('/session/' + encodeURIComponent(sessionId) + query);
    requireValue(
      record(session) &&
        session['id'] === sessionId &&
        typeof session['directory'] === 'string' &&
        sameDirectory(session['directory']),
      'PROJECT'
    );
    const messages = await get(
      '/session/' + encodeURIComponent(sessionId) + '/message' + query + '&limit=100'
    );
    requireValue(Array.isArray(messages), 'MESSAGES');
    return { session: session as RecordValue, messages: messages as RecordValue[] };
  };
  const toolParts = (messages: RecordValue[]) =>
    messages.flatMap(message =>
      record(message['info']) && Array.isArray(message['parts'])
        ? message['parts'].filter(record).map(part => ({ message, part }))
        : []
    );
  const live = ({ message, part }: { message: RecordValue; part: RecordValue }) =>
    message['info']['role'] === 'assistant' &&
    message['info']['error'] === undefined &&
    message['info']['sessionID'] === part['sessionID'] &&
    record(message['info']['path']) &&
    typeof message['info']['path']['cwd'] === 'string' &&
    sameDirectory(message['info']['path']['cwd']) &&
    record(message['info']['time']) &&
    Number.isSafeInteger(message['info']['time']['created']) &&
    part['type'] === 'tool' &&
    record(part['state']) &&
    part['state']['status'] === 'running' &&
    record(part['state']['time']) &&
    Number.isSafeInteger(part['state']['time']['start']) &&
    part['state']['time']['start'] >= message['info']['time']['created'] &&
    part['state']['time']['start'] <= Date.now();
  // A source read spans multiple HTTP requests. Recheck every live edge before
  // returning so cancellation or parent replacement cannot authorize a write.
  const witnesses: { sessionId: string; session: string; call: string }[] = [];
  const sessionIdentity = (session: RecordValue) =>
    canonical({
      id: session['id'],
      directory: session['directory'],
      parent: session['parentID'] ?? null,
    });
  const callIdentity = ({ message, part }: { message: RecordValue; part: RecordValue }) =>
    canonical({
      message: message['info']['id'],
      session: message['info']['sessionID'],
      parent: message['info']['parentID'],
      agent: message['info']['agent'],
      call: part['callID'],
      tool: part['tool'],
      input: part['state']['input'],
      child: part['state']['metadata']?.['sessionId'] ?? null,
    });
  const remember = (
    sessionId: string,
    session: RecordValue,
    pair: { message: RecordValue; part: RecordValue }
  ) => witnesses.push({ sessionId, session: sessionIdentity(session), call: callIdentity(pair) });
  let loaded = await load(input['sessionId']);
  const matches = toolParts(loaded.messages).filter(
    pair =>
      live(pair) &&
      pair.part['callID'] === input.callId &&
      pair.part['tool'] === input['tool'] &&
      pair.part['sessionID'] === input['sessionId'] &&
      pair.part['messageID'] === pair.message['info']['id'] &&
      (!input.messageId || pair.message['info']['id'] === input.messageId) &&
      record(pair.part['state']['input']) &&
      canonical(pair.part['state']['input']) === canonical(input.args)
  );
  requireValue(matches.length === 1, 'LIVE_CALL');
  const initial = matches[0]!;
  requireValue(Date.now() - initial.part['state']['time']['start'] <= 300_000, 'FRESHNESS');
  requireValue(
    typeof initial.message['info']['agent'] === 'string' &&
      initial.message['info']['agent'].length > 0,
    'AGENT'
  );
  remember(input.sessionId, loaded.session, initial);
  let currentMessage = initial.message;
  let currentSession = input['sessionId'];
  const chain: unknown[] = [];
  const visited = new Set<string>();
  const delegationOwners: unknown[] = [];
  for (let depth = 0; depth < 8; depth++) {
    requireValue(!visited.has(currentSession), 'CYCLE');
    visited.add(currentSession);
    chain.push({
      session: currentSession,
      message: currentMessage['info']['id'],
      parent: currentMessage['info']['parentID'],
    });
    if (!loaded.session['parentID']) {
      const userId: unknown = currentMessage['info']['parentID'];
      if (typeof userId !== 'string' || !/^msg_[A-Za-z0-9]+$/.test(userId))
        throw new Error('REQUIRED_VERIFICATION_SOURCE_USER_ID');
      const user = await get(
        '/session/' +
          encodeURIComponent(currentSession) +
          '/message/' +
          encodeURIComponent(userId) +
          query
      );
      requireValue(
        record(user) &&
          record(user['info']) &&
          user['info']['id'] === userId &&
          user['info']['sessionID'] === currentSession &&
          user['info']['role'] === 'user' &&
          Array.isArray(user['parts']),
        'USER'
      );
      const value = user as RecordValue;
      const texts = value['parts'].filter(
        (part: unknown) => record(part) && part['type'] === 'text'
      );
      requireValue(
        texts.length === 1 &&
          texts[0]['sessionID'] === currentSession &&
          texts[0]['messageID'] === userId &&
          texts[0]['synthetic'] !== true &&
          texts[0]['ignored'] !== true &&
          typeof texts[0]['text'] === 'string',
        'USER_TEXT'
      );
      requireValue(
        record(value['info']['time']) &&
          Number.isSafeInteger(value['info']['time']['created']) &&
          value['info']['time']['created'] >= 0 &&
          value['info']['time']['created'] <= currentMessage['info']['time']['created'],
        'USER_TIME'
      );
      const text = texts[0]['text'] as string;
      const userIdentity = canonical(user);
      const declaration = parseRequiredVerificationDeclaration(text);
      if (declaration) {
        requireValue(
          [
            'sf-orchestrator',
            'sf-analyst',
            'sf-debugger',
            'sf-design',
            'sf-evidence-collector',
            'sf-executor',
            'sf-extension',
            'sf-investigator',
            'sf-knowledge',
            'sf-requirements',
            'sf-reviewer',
            'sf-task-planner',
            'sf-verifier',
          ].includes(initial.message['info']['agent'] as string),
          'AGENT'
        );
        requireValue(
          delegationOwners.every(agent => agent === 'sf-orchestrator'),
          'DELEGATION_OWNER'
        );
      }
      const currentTurn = (messages: RecordValue[]) => {
        const users = messages.filter(
          message => record(message['info']) && message['info']['role'] === 'user'
        );
        requireValue(
          users.filter(message => message['info']['id'] === userId).length === 1,
          'USER_NOT_IN_CURRENT_WINDOW'
        );
        requireValue(
          users.every(
            message =>
              message['info']['id'] === userId ||
              (record(message['info']['time']) &&
                Number.isSafeInteger(message['info']['time']['created']) &&
                message['info']['time']['created'] < value['info']['time']['created'])
          ),
          'NEWER_USER_TURN'
        );
      };
      currentTurn(loaded.messages);
      for (const witness of witnesses) {
        const current = await load(witness.sessionId);
        requireValue(sessionIdentity(current.session) === witness.session, 'SESSION_CHANGED');
        requireValue(
          toolParts(current.messages).filter(
            pair => live(pair) && callIdentity(pair) === witness.call
          ).length === 1,
          'CALL_CHANGED'
        );
        if (witness.sessionId === currentSession) currentTurn(current.messages);
      }
      const currentUser = await get(
        '/session/' +
          encodeURIComponent(currentSession) +
          '/message/' +
          encodeURIComponent(userId) +
          query
      );
      requireValue(canonical(currentUser) === userIdentity, 'USER_CHANGED');
      return {
        source: 'required-verification-source/v1',
        sessionId: input['sessionId'],
        messageId: initial.message['info']['id'],
        callId: input.callId,
        agent: initial.message['info']['agent'],
        tool: input.tool,
        inputSha256: hash(canonical(input.args)),
        directory: path.resolve(input['directory']),
        userSessionId: currentSession,
        userMessageId: userId,
        userTextSha256: hash(text),
        userCreatedAt: value['info']['time']['created'],
        observedAt: new Date().toISOString(),
        declaration,
        chainSha256: hash(canonical(chain)),
      };
    }
    const parentId: unknown = loaded.session['parentID'];
    if (typeof parentId !== 'string' || !/^ses_[A-Za-z0-9]+$/.test(parentId))
      throw new Error('REQUIRED_VERIFICATION_SOURCE_PARENT_SESSION');
    const parent = await load(parentId);
    const delegations = toolParts(parent.messages).filter(
      pair =>
        live(pair) &&
        pair.part['tool'] === 'task' &&
        pair.part['state']['status'] === 'running' &&
        pair.part['state']['metadata']?.['sessionId'] === currentSession &&
        pair.part['sessionID'] === parentId &&
        pair.part['messageID'] === pair.message['info']['id']
    );
    requireValue(delegations.length === 1, 'LIVE_DELEGATION');
    delegationOwners.push(delegations[0]!.message['info']['agent']);
    remember(parentId, parent.session, delegations[0]!);
    chain.push({ delegatedBy: parentId, call: delegations[0]!.part['callID'] });
    currentSession = parentId;
    currentMessage = delegations[0]!.message;
    loaded = parent;
  }
  throw new Error('REQUIRED_VERIFICATION_SOURCE_DEPTH');
}
