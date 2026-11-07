'use strict';
// Interactive MC allocates very differently from the small controller/worker JVMs.
// Keep heap limits, agents and game arguments; choose one collector before launch.
function interactiveJvmArgs(args){
 if(!Array.isArray(args)||args.some(x=>typeof x!=='string'))throw Error('MANUAL_JVM_ARGS_REQUIRED');
 const cp=args.indexOf('-cp');if(cp<0||cp+2>=args.length)throw Error('MANUAL_JVM_CLASSPATH_REQUIRED');
 const prefix=args.slice(0,cp).filter(x=>!/^[-]XX:[+-]Use(?:Serial|Parallel|G1|Z|Shenandoah)GC$/.test(x)&&!x.startsWith('-XX:MaxGCPauseMillis=')&&!/^[-]XX:[+-]ErrorFileToStderr$/.test(x));
 // Preserve the fatal report in the already captured host stderr as well.
 // A separate hs_err file may be absent after a native reporting failure.
 // This is evidence collection, not crash recovery or a survival guarantee.
 return [...prefix,'-XX:+UseG1GC','-XX:MaxGCPauseMillis=100','-XX:+ErrorFileToStderr',...args.slice(cp)];
}
module.exports={interactiveJvmArgs};
