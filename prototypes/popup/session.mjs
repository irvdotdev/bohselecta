import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.env.BOHSELECTA_POPUP_OWNER_PID=String(process.pid);
const result=spawnSync(process.env.BOHSELECTA_CLAUDE_BIN||'claude',['--plugin-dir',fileURLToPath(new URL('../claude-native',import.meta.url)),'--model',process.argv[2]||'sonnet'],{stdio:'inherit',env:process.env});
if(result.error)console.error(result.error.message);
process.exitCode=result.status??1;
