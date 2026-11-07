'use strict';
// Opt-in preparation of a new private production configuration. Does not launch MC.
// The ordinary sealer then pins this library and the amended class path with all other inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateProduction}=require('../../mc-1.20.1/runtime/forge-production.cjs');
const [source,gate,output]=process.argv.slice(2);
if(!source||!gate||!output)throw Error('USAGE: enable-lifetime-gate.cjs source.json gate.jar new-config.json');
if(fs.existsSync(output))throw Error('OUTPUT_ALREADY_EXISTS');
const cfg=JSON.parse(fs.readFileSync(source,'utf8'));validateProduction(cfg.host,cfg.host.args);
const bytes=fs.readFileSync(gate);if(bytes.length>1024*1024||bytes.readUInt32LE(0)!==0x04034b50)throw Error('GATE_JAR_REQUIRED');
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
const library=path.join(cfg.host.libraryDirectory,'eff','lifetime',hash,'eff-lifetime-gate.jar');
const cp=cfg.host.args.indexOf('-cp');
if(cfg.host.args[cp+1].split(path.delimiter).some(p=>path.basename(p)==='eff-lifetime-gate.jar'))throw Error('GATE_ALREADY_CONFIGURED');
fs.mkdirSync(path.dirname(library),{recursive:true});
if(fs.existsSync(library)){
 if(!fs.readFileSync(library).equals(bytes))throw Error('EXISTING_GATE_CONTENT_MISMATCH');
}else fs.writeFileSync(library,bytes,{flag:'wx'});
cfg.host.args[cp+1]+=path.delimiter+library;
validateProduction(cfg.host,cfg.host.args);
fs.writeFileSync(output,JSON.stringify(cfg,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({prepared:true,launched:false,gateSHA256:hash,configuration:path.resolve(output)}));
