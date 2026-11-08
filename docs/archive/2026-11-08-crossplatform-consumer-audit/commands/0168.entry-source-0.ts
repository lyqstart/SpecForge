import {prepareCurrentRelease} from '../../../scripts/lib/prepare-current-release';
console.log(JSON.stringify({entry:'without_top_level_await',loaded:typeof prepareCurrentRelease==='function'}));
