import * as vu from './src/index.ts';

console.log('=== version-unification exports ===');
const exports = Object.keys(vu).sort();
exports.forEach(e => console.log(e));
console.log('\nTotal exports:', exports.length);