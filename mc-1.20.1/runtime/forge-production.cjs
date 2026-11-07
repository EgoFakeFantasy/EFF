'use strict';
// Official Forge client layout: retain Maven paths and seal every library input.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function relativeLibrary(root,file){
 const rel=path.relative(path.resolve(root),path.resolve(file));
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('PRODUCTION_LIBRARY_OUTSIDE_ROOT');
 return rel;
}
function validateProduction(h,args){
 if(h.loader!=='forge'||h.distribution!=='production'||Object.keys(h.env||{}).length)throw Error('FORGE_PRODUCTION_CONFIG');
 for(const key of ['libraryDirectory','modJar','storyBundle'])if(typeof h[key]!=='string'||!path.isAbsolute(h[key]))throw Error('FORGE_PRODUCTION_INPUT');
 const indices=flag=>args.map((a,i)=>a===flag?i:-1).filter(i=>i>=0);
 for(const flag of ['-cp','-p','--launchTarget'])if(indices(flag).length!==1)throw Error('FORGE_PRODUCTION_ARGUMENTS');
 if(args[indices('--launchTarget')[0]+1]!=='forgeclient'||args.some(a=>/^-D(?:legacyClassPath|mixin\.env\.refMapRemappingFile|net\.minecraftforge\.gradle\.)/.test(a)))throw Error('FORGE_PRODUCTION_TARGET');
 const roots=args.filter(a=>a.startsWith('-DlibraryDirectory='));
 if(roots.length!==1||path.resolve(roots[0].slice(19))!==path.resolve(h.libraryDirectory))throw Error('FORGE_PRODUCTION_LIBRARY_ROOT');
 for(const flag of ['-cp','-p'])for(const file of args[indices(flag)[0]+1].split(path.delimiter))relativeLibrary(h.libraryDirectory,file);
 validateLibraryOverrides(h);
}
function validateLibraryOverrides(h){
 const result=new Map();
 if(h.libraryOverrides===undefined)return result;
 if(!Array.isArray(h.libraryOverrides)||h.libraryOverrides.length>16)throw Error('LIBRARY_OVERRIDE_LIST');
 for(const entry of h.libraryOverrides){
  if(!entry||typeof entry.relativePath!=='string'||path.isAbsolute(entry.relativePath)||
     !entry.relativePath.endsWith('.jar')||typeof entry.source!=='string'||!path.isAbsolute(entry.source)||
     !/^[a-f0-9]{64}$/.test(entry.sha256)||!/^[a-f0-9]{64}$/.test(entry.originalSHA256))throw Error('LIBRARY_OVERRIDE_IDENTITY');
  const original=path.resolve(h.libraryDirectory,entry.relativePath),rel=relativeLibrary(h.libraryDirectory,original);
  const key=process.platform==='win32'?rel.toLowerCase():rel;
  if(result.has(key))throw Error('LIBRARY_OVERRIDE_DUPLICATE');
  for(const file of [original,entry.source]){
   const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)throw Error('LIBRARY_OVERRIDE_FILE');
  }
  if(sha(original)!==entry.originalSHA256||sha(entry.source)!==entry.sha256)throw Error('LIBRARY_OVERRIDE_HASH_MISMATCH');
  result.set(key,{...entry,relativePath:rel,original});
 }
 return result;
}
function sealProduction(h,args,{payload,pin,walk}){
 validateProduction(h,args);
 const overrides=validateLibraryOverrides(h),used=new Set();
 const source=path.resolve(h.libraryDirectory),target=path.join(payload,'libraries');fs.mkdirSync(target);
 const files=walk(source);let total=0;
 if(files.length>2000)throw Error('PRODUCTION_LIBRARY_COUNT');
 for(const file of files){total+=fs.statSync(file).size;if(total>1024**3)throw Error('PRODUCTION_LIBRARY_BUDGET');}
 for(const file of files){const rel=relativeLibrary(source,file),key=process.platform==='win32'?rel.toLowerCase():rel;
  const override=overrides.get(key),dest=path.join(target,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(override?override.source:file,dest);
  if(override){if(sha(dest)!==override.sha256)throw Error('LIBRARY_OVERRIDE_COPY_CHANGED');used.add(key);}
  pin(dest);
 }
 if(used.size!==overrides.size)throw Error('LIBRARY_OVERRIDE_NOT_COPIED');
 for(const flag of ['-cp','-p']){const at=args.indexOf(flag);args[at+1]=args[at+1].split(path.delimiter).map(f=>{if(!fs.statSync(f).isFile())throw Error('PRODUCTION_CLASSPATH_FILE_REQUIRED');return path.join(target,relativeLibrary(source,f));}).join(path.delimiter);}
 const at=args.findIndex(a=>a.startsWith('-DlibraryDirectory='));args[at]='-DlibraryDirectory='+target;h.libraryDirectory=target;
 if(overrides.size)h.libraryOverrideReceipt=[...overrides.values()].map(({relativePath,originalSHA256,sha256})=>({relativePath,originalSHA256,sha256}));
 delete h.libraryOverrides;
}
module.exports={relativeLibrary,validateProduction,validateLibraryOverrides,sealProduction};
