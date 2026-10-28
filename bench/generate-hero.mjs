import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
// Deterministic synthetic landscape, with texture so it is not a placeholder LCP.
const w=900,h=310,scan=Buffer.alloc((w*3+1)*h);
let seed=127;
for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed>>>31;
  const mountain=y>180+70*Math.sin(x/125);
  const sun=(x-690)**2+(y-100)**2<65**2;
  const rgb=sun?[242,237,184]:mountain?[25+y/7,68+y/7,61+y/9]:[80+y/4,132+y/5,135-y/12];
  const index=y*(w*3+1)+1+x*3;
  rgb.forEach((v,c)=>scan[index+c]=Math.floor(v+noise));
}
const table=Array.from({length:256},(_,v)=>{for(let k=0;k<8;k++)v=(v&1)?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function chunk(name,data){const type=Buffer.from(name),all=Buffer.concat([type,data]);let crc=0xffffffff;for(const b of all)crc=table[(crc^b)&255]^(crc>>>8);const size=Buffer.alloc(4),tail=Buffer.alloc(4);size.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,all,tail]);}
const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);
await writeFile(new URL('fixtures/hero.png',import.meta.url),png);
console.log(`Fixture hero: ${png.length} bytes`);
