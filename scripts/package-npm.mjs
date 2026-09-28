import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const assets=resolve(process.argv[2]||'release'),output=resolve(process.argv[3]||assets);
const platforms=process.argv.includes('--platform-only')?[`${process.platform}-${process.arch}`]:['darwin-arm64','darwin-x64','linux-arm64','linux-x64'];
const temp=mkdtempSync(join(tmpdir(),'boh-npm-'));
try {
 const stage=join(temp,'package');mkdirSync(stage);mkdirSync(output,{recursive:true});
 const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
 delete pkg.private;delete pkg.scripts;delete pkg.devDependencies;
 pkg.os=['darwin','linux'];pkg.cpu=['arm64','x64'];pkg.publishConfig={access:'public',tag:'alpha'};
 writeFileSync(join(stage,'package.json'),JSON.stringify(pkg,null,2)+'\n');
 for(const name of ['LICENSE','README.md','CHANGELOG.md','bin','prototypes/claude-native'])cpSync(join(root,name),join(stage,name),{recursive:true});
 mkdirSync(join(stage,'prototypes/popup/prebuilt'),{recursive:true});
 for(const name of ['session.mjs','continue.mjs'])cpSync(join(root,'prototypes/popup',name),join(stage,'prototypes/popup',name));
 for(const platform of platforms) {
  const target=join(stage,'prototypes/popup/prebuilt',`boh-popup-${platform}`);
  cpSync(join(assets,`boh-popup-${platform}`),target);chmodSync(target,0o755);
 }
 execFileSync(join(root,'node_modules/.bin/tsc'),['-p',join(root,'tsconfig.build.json'),'--outDir',join(stage,'src')],{stdio:'inherit'});
 // Non-TypeScript entrypoints and Claude plugin scripts must also import compiled JS.
 function rewrite(dir) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
   const path=join(dir,entry.name);
   if(entry.isDirectory())rewrite(path);
   else if(/\.(?:mjs|js)$/.test(entry.name))writeFileSync(path,readFileSync(path,'utf8').replace(/(['"])(\.\.?\/[^'"\n]+)\.ts\1/g,'$1$2.js$1'));
  }
 }
 rewrite(join(stage,'bin'));rewrite(join(stage,'prototypes'));
 const result=JSON.parse(execFileSync('npm',['pack',stage,'--ignore-scripts','--json','--pack-destination',output],{encoding:'utf8'}));
 console.log(join(output,result[0].filename));
}finally{rmSync(temp,{recursive:true,force:true});}
