'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {interactiveJvmArgs}=require('./manual-jvm-options.cjs');
test('interactive collector selection preserves heap ceiling, agents and game tail',()=>{
 const args=['-Xms64m','-Xmx1536m','-XX:+UseSerialGC','-javaagent:C:/sealed/agent.jar','-XX:+UseSerialGC','-XX:MaxGCPauseMillis=500','-XX:ActiveProcessorCount=2','-cp','C:/sealed/bootstrap.jar','Main','--name','-XX:+UseSerialGC'];
 const next=interactiveJvmArgs(args),at=next.indexOf('-cp');
 assert.deepEqual(next.slice(at),args.slice(args.indexOf('-cp')));
 assert.deepEqual(next.filter(x=>/^[-]Xm[sx]/.test(x)),['-Xms64m','-Xmx1536m']);
 assert(next.includes('-javaagent:C:/sealed/agent.jar'));assert(next.includes('-XX:ActiveProcessorCount=2'));
 assert.deepEqual(next.slice(0,at).filter(x=>x.includes('GC')),['-XX:+UseG1GC','-XX:MaxGCPauseMillis=100']);
 assert.equal(args.filter(x=>x==='-XX:+UseSerialGC').length,3);
 assert.deepEqual(interactiveJvmArgs(next),next);
});
test('missing classpath structure is rejected before generating a launch',()=>{
 for(const args of [null,['-cp'],['-cp','x'],[42]])assert.throws(()=>interactiveJvmArgs(args));
});
test('fatal stderr reporting is enabled once without changing stack limits, report path or game arguments',()=>{
 const args=['-Xss1m','-XX:ThreadStackSize=1024','-XX:ErrorFile=custom-error.log','-XX:-ErrorFileToStderr','-XX:+ErrorFileToStderr','-cp','bootstrap.jar','Main','-XX:-ErrorFileToStderr'];
 const next=interactiveJvmArgs(args),at=next.indexOf('-cp');
 assert.deepEqual(next.slice(0,at).filter(x=>x.includes('ErrorFileToStderr')),['-XX:+ErrorFileToStderr']);
 for(const fixed of args.slice(0,3))assert(next.includes(fixed));
 assert.deepEqual(next.slice(at),args.slice(args.indexOf('-cp')));
 assert.deepEqual(interactiveJvmArgs(next),next);
 assert.equal(args[3],'-XX:-ErrorFileToStderr');
});
