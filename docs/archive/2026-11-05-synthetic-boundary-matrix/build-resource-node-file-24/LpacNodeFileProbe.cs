// Finite synthetic file/test-runner compatibility probe; never caller supplied code.
using System;using System.IO;using System.Text;using System.Text.RegularExpressions;
internal static class LpacNodeFileProbe {
    internal static string Script(){return "'use strict';const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');test('fixed readonly file and builtin modules',()=>{assert.equal(require('./fixed-module.cjs'),42);assert.equal(fs.readFileSync(path.join(__dirname,'fixed-module.cjs'),'utf8'),'module.exports=42;\\n');assert.throws(()=>fs.writeFileSync(path.join(__dirname,'fixed-module.cjs'),'changed'),e=>e.code==='EACCES'||e.code==='EPERM');console.log('SFFILE_TEST_ASSERTIONS_PASSED');});\n";}
    internal static bool Validate(byte[] stdout,byte[] stderr,uint exit){string text=Encoding.UTF8.GetString(stdout);return exit==0&&stderr.Length==0&&Regex.Matches(text,"SFFILE_TEST_ASSERTIONS_PASSED").Count==1&&Regex.IsMatch(text,@"(?m)^# tests 1\r?$")&&Regex.IsMatch(text,@"(?m)^# pass 1\r?$")&&Regex.IsMatch(text,@"(?m)^# fail 0\r?$")&&!Regex.IsMatch(text,@"(?m)^not ok ");}
}
