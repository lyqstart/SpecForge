import {prepareCurrentRelease} from '../../../scripts/lib/prepare-current-release';
prepareCurrentRelease({candidateRoot:process.cwd(),bunExecutable:process.execPath,nodeSource:process.env.SPECFORGE_VERIFICATION_NODE_SOURCE}).then(result=>console.log(JSON.stringify({version:result.identity.version,precheck:result.precheck.passed}))).catch(error=>{console.error(error);process.exitCode=1;});
