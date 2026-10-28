import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

// Small deterministic ZIP writer: no packaging dependency or shell-specific tool.
const crcTable = Array.from({ length:256 }, (_,n) => {
  for (let k=0;k<8;k++) n=(n&1)?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
const crc32 = bytes => { let crc=0xffffffff; for(const b of bytes) crc=crcTable[(crc^b)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; };
async function files(root, excluded=new Set()) {
  const result=[];
  async function walk(dir) {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      if(excluded.has(entry.name)) continue;
      const path=join(dir,entry.name);
      if(entry.isDirectory()) await walk(path);
      else if(entry.isFile()) result.push({path,name:relative(root,path).replaceAll('\\','/')});
    }
  }
  await walk(root); return result.sort((a,b)=>a.name.localeCompare(b.name));
}
async function zip(entries, target) {
  const chunks=[], central=[];let offset=0;
  for(const entry of entries) {
    const bytes=await readFile(entry.path), compressed=deflateRawSync(bytes), name=Buffer.from(entry.name);
    const crc=crc32(bytes), header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6); header.writeUInt16LE(8,8);
    header.writeUInt16LE(0x5c21,12); header.writeUInt32LE(crc,14); header.writeUInt32LE(compressed.length,18); header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(name.length,26);
    chunks.push(header,name,compressed);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(0x5c21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
    central.push(c,name);offset+=header.length+name.length+compressed.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  await writeFile(target,Buffer.concat([...chunks,directory,end]));
  console.log(`${target}: ${entries.length} files`);
}
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
if(manifest.host_permissions || manifest.content_scripts) throw new Error('Production manifest must not grant site access');
for(const required of ['extension/content.js','extension/background.js','extension/options.js','LICENSE','README.md']) await readFile(required);
await mkdir('dist',{recursive:true});
const ext=await files(resolve('extension'));
ext.push({path:resolve('LICENSE'),name:'LICENSE'});
await zip(ext,`dist/neuroload-extension-${manifest.version}.zip`);
const source=await files(resolve('.'),new Set(['node_modules','.work','.git','dist','results']));
await zip(source,`dist/neuroload-source-${manifest.version}.zip`);
