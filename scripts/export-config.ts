import {mkdirSync,writeFileSync} from 'node:fs';
import {CONFIG} from '../src/config';
mkdirSync('artifacts',{recursive:true});
writeFileSync('artifacts/default-config.json',JSON.stringify(CONFIG,null,2)+'\n');
