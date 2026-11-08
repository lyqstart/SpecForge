import {prepareCurrentRelease} from '../../../scripts/lib/prepare-current-release';
await Promise.resolve();
console.log(JSON.stringify({entry:'with_top_level_await',loaded:typeof prepareCurrentRelease==='function'}));
