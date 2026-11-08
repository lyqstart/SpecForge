import path from 'node:path';import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadProductIdentity,assertWorkspaceVersionAlignment} from './product-identity';
import {buildReleaseRuntimeArtifacts} from './release-runtime-artifact-producer';
import {buildVerificationAssets} from './verification-asset-producer';
import {produceReleaseManifest} from './release-manifest-producer';

/** Complete the declared foundation ESM entries before loading CJS consumers. */
export async function initializeSharedRuntimeExports(root:string):Promise<string[]> {
  const packageRoot=path.join(root,'packages/types');
  const manifest=JSON.parse(await readFile(path.join(packageRoot,'package.json'),'utf8'));
  if(!manifest.exports||typeof manifest.exports!=='object')throw Error('RELEASE_SHARED_EXPORTS_INVALID');
  const initialized:string[]=[];
  for(const descriptor of Object.values(manifest.exports)){
    const entry=(descriptor as {import?:unknown})?.import;
    if(typeof entry!=='string'||!/^\.\/dist\/[A-Za-z0-9_-]+\.js$/.test(entry))throw Error('RELEASE_SHARED_EXPORT_ENTRY_INVALID');
    await import(pathToFileURL(path.join(packageRoot,entry)).href);
    initialized.push(entry);
  }
  return initialized;
}
/** Build-time composition of existing owners; never an application runtime fallback. */
export async function prepareCurrentRelease(options:{candidateRoot:string;bunExecutable:string;nodeSource?:string;buildWorkspace?:boolean}){
  const root=path.resolve(options.candidateRoot),identity=await loadProductIdentity(root);await assertWorkspaceVersionAlignment(root,identity.version);
  const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});if(git.status!==0||!/^[a-f0-9]{40}$/.test(git.stdout.trim()))throw Error('RELEASE_GIT_REFERENCE_UNAVAILABLE');const candidateId='commit-'+git.stdout.trim();
  if(options.buildWorkspace!==false){const result=spawnSync(options.bunExecutable,['scripts/build-workspace.ts'],{cwd:root,windowsHide:true,stdio:'inherit'});if(result.status!==0)throw Error('RELEASE_WORKSPACE_BUILD_FAILED:'+String(result.status));}
  const runtimes=await buildReleaseRuntimeArtifacts({candidateRoot:root,bunExecutable:options.bunExecutable}),verificationAssets=await buildVerificationAssets({candidateRoot:root,nodeSource:options.nodeSource});
  const produced=await produceReleaseManifest({candidateRoot:root,releaseId:identity.releaseId,candidateId});if(produced.errors.length)throw Error('RELEASE_MANIFEST_INVALID:'+produced.errors.join(';'));
  // Owner snapshots load the real Tool/Workflow graph and its package exports.
  // A fresh checkout must build those exports before loading that graph.
  // Finish shared ESM initialization before hybrid CommonJS consumers load it.
  await initializeSharedRuntimeExports(root);
  const {runCurrentReleasePrecheck}=await import('./current-release-precheck');
  const precheck=await runCurrentReleasePrecheck({candidateRoot:root,releaseId:identity.releaseId,candidateId});if(!precheck.passed)throw Error('RELEASE_PRECHECK_FAILED:'+JSON.stringify(precheck));
  return {identity,candidateId,runtimes,verificationAssets,document:produced.document,precheck};
}
