import {prepareCurrentRelease} from './lib/prepare-current-release';
const result=await prepareCurrentRelease({candidateRoot:process.cwd(),bunExecutable:process.execPath,nodeSource:process.env.SPECFORGE_VERIFICATION_NODE_SOURCE});
console.log(JSON.stringify({version:result.identity.version,candidateId:result.candidateId,platform:process.platform,architecture:process.arch,install_files:result.document.installFiles.length,precheck_passed:result.precheck.passed},null,2));
