// Earn the debt through normal purchases and simulated maintenance; never patch the balance.
import {mkdirSync,writeFileSync} from 'node:fs';
import {network,cmd,minutes} from './support/world';
import {executeUpgrade} from '../src/simulation/development';
import {encodeSave,decodeSave} from '../src/storage/save';
const w=network();cmd(w,{type:'buy',model:'light'});cmd(w,{type:'buy',model:'light'});
for(const station of ['A','B'] as const)for(const kind of ['shelter','service','shops'] as const)executeUpgrade(w,{station,kind,revision:w.development.revision});
minutes(w,1440);w.clock.paused=true;const raw=encodeSave(w);decodeSave(raw);mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/stage-9-bankrupt.json',raw);
