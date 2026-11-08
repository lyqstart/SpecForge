const fs=require('node:fs'),path=require('node:path'),root=__dirname,original=JSON.parse(fs.readFileSync(path.join(root,'consumer-inventory.json'))),rows=original.documents.map(d=>({...d,disposition:null}));
for(const d of rows){const p=d.path;
 if(p.startsWith('.specforge/')){d.classification='LEGACY_PRODUCT_SELF_GOVERNANCE_RECORD';d.disposition='Preserve readonly historical records,not current product behavior authority; do not start product-self WI.';}
 else if(p.startsWith('.patch-backups/')){d.classification='HISTORICAL_BACKUP';d.disposition='Exact retained backup,no active product entry.';}
 else if(p.startsWith('tests/')||p.startsWith('test-data/')||p.includes('/test-data/')||p.includes('/artifacts/')){d.classification='TEST_FIXTURE_OR_HISTORICAL_REPORT';d.disposition='Evidence or synthetic fixture; inspect actual active test producer separately,never adopt fixture claims as product behavior.';}
 else if(p==='CHANGELOG.md'){d.classification='HISTORICAL_RELEASE_TIMELINE';d.disposition='Historical release descriptions retained;current release contract comes from SPS/root identity.';}
 else if(p==='.github/pull_request_template.md'){d.classification='INACTIVE_PR_TEMPLATE';d.disposition='Single-maintainer direct-main rule applies; no PR is created or required by current workflow.';}
 else if(p.startsWith('setup/userlevel-templates/')){d.classification='CURRENT_INSTALLED_TEMPLATE';}
 else if(p==='setup/README.md'){d.classification='CURRENT_SETUP_ENTRY';}
 else if(/(?:IMPLEMENTATION_SUMMARY|COMPLETION_SUMMARY|VALIDATION_REPORT|TASK_\d.*COMPLETION|PROJECT_STRUCTURE)\.md$/.test(p)){d.classification='PACKAGE_HISTORY_REVIEW';}
}
const unclassified=rows.filter(d=>d.classification==='UNCLASSIFIED_CURRENT_CANDIDATE'),groups={};for(const d of rows)(groups[d.classification]??=[]).push(d.path);fs.writeFileSync(path.join(root,'document-review-scope.json'),JSON.stringify({utc:new Date().toISOString(),documents:rows,groups,unclassified,source_inventory:'consumer-inventory.json',meaning:'Role classification only; current files still need semantic review. Historical/fixture bytes are retained,not made current by scan.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({documents:rows.length,unclassified:unclassified.length,groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length]))}));
