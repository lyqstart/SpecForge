const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7', directories = [], files = [];
function walk(dir, prefix = '') {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name), relative = prefix + name, stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw Error('LINK');
    if (stat.isDirectory()) { directories.push(relative); walk(full, relative + '/'); }
    else files.push({ path: relative, size: stat.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') });
  }
}
walk(target);
const value = { utc: new Date().toISOString(), target, directories, files, inner_exit_code: 0 };
fs.writeFileSync(path.join(__dirname, 'residue-after-rejection.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ directories: directories.length, files, inner_exit_code: 0 }));
