"use strict";
const {createHash}=require('node:crypto');
const MAX_GENERATION=16, roles=['policy','execution'];
const hash=value=>createHash('sha256').update(value).digest('hex');
function descriptor(role,ruleset,generation=0,parent='GENESIS') {
 const id=hash(`eff-engine-v1\n${role}\n${ruleset}\n${generation}\n${parent}`);
 return {schema:1,role,generation,parent,ruleset,id};
}
function validate(value,role,ruleset){
 if(!value||Object.keys(value).sort().join(',')!=='generation,id,parent,role,ruleset,schema'||value.schema!==1||value.role!==role||!roles.includes(role)||value.ruleset!==ruleset||!/^[a-f0-9]{64}$/.test(ruleset)||!Number.isSafeInteger(value.generation)||value.generation<0||value.generation>MAX_GENERATION||!(value.generation===0?value.parent==='GENESIS':/^[a-f0-9]{64}$/.test(value.parent))||value.id!==descriptor(role,ruleset,value.generation,value.parent).id)throw Error('ENGINE_DESCRIPTOR_INVALID');
 return value;
}
function roots(ruleset){return Object.fromEntries(roles.map(role=>[role,[descriptor(role,ruleset)]]));}
function validateLineage(chains,ruleset){
 if(!chains||Object.keys(chains).sort().join(',')!=='execution,policy')throw Error('ENGINE_LINEAGE_INVALID');
 for(const role of roles){const chain=chains[role];if(!Array.isArray(chain)||!chain.length||chain.length>MAX_GENERATION+1)throw Error('ENGINE_LINEAGE_BUDGET');
  chain.forEach((d,n)=>{validate(d,role,ruleset);if(d.generation!==n||d.parent!==(n?chain[n-1].id:'GENESIS'))throw Error('ENGINE_LINEAGE_BROKEN');});}
 return chains;
}
function successor(parent){if(parent.generation>=MAX_GENERATION)throw Error('ENGINE_GENERATION_BUDGET');return descriptor(parent.role,parent.ruleset,parent.generation+1,parent.id);}
function validatePacket(packet,expected){
 if(!packet||!packet.descriptor||Object.keys(packet.descriptor).length!==6||Object.keys(expected).some(k=>packet.descriptor[k]!==expected[k])||packet.className!=='eff.generated.E'+expected.id||typeof packet.artifact!=='string'||packet.artifact.length>16384||!/^[A-Za-z0-9+/]+={0,2}$/.test(packet.artifact))throw Error('ENGINE_PACKET_INVALID');
 const bytes=Buffer.from(packet.artifact,'base64');if(bytes.length<16||bytes.toString('base64')!==packet.artifact||hash(bytes)!==packet.bytecodeSHA256)throw Error('ENGINE_BYTECODE_INVALID');
 return packet;
}
module.exports={MAX_GENERATION,roles,hash,descriptor,roots,validate,validateLineage,successor,validatePacket};
