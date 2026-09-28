import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const dir=process.argv[2]||'release';
const lines=readdirSync(dir).filter(name=>name!=='SHA256SUMS').sort().map(name=>`${createHash('sha256').update(readFileSync(join(dir,name))).digest('hex')}  ${name}`);
writeFileSync(join(dir,'SHA256SUMS'),lines.join('\n')+'\n');
