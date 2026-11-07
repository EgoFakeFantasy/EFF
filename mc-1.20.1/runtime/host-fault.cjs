'use strict';
// Bounded external-controller observations. Never serialize leases, arguments or host input.
const counter = x => Number.isSafeInteger(x) && x >= 0 ? x : null;
function describeHostFault(c, reason, now) {
  const age = t => Number.isFinite(t) && Number.isFinite(now) && now >= t ? Math.round(now-t) : null;
  const p=c.progress;
  return {
    schema:1, reason:/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(reason)?reason:'UNKNOWN_HOST_FAULT',
    atUnixMs:Date.now(), controllerPid:process.pid, hostPid:counter(c.host?.pid),
    hostEpoch:counter(c.hostEpoch), controllerGeneration:counter(c.config.protectedGeneration),
    initialized:c.hostReady===true, requireProjection:c.requireProjection===true,
    heartbeatSequence:counter(c.lastHeartbeatSequence), elapsedSinceStartMs:age(c.hostStarted),
    lastContactAgeMs:age(c.lastContact), clientProgressAgeMs:age(c.clientProgress), serverProgressAgeMs:age(c.serverProgress),
    progress:p?{clientTick:counter(p.clientTick),serverTick:counter(p.serverTick),active:p.active===true,paused:p.paused===true}:null,
    hostExitCode:Number.isInteger(c.host?.exitCode)?c.host.exitCode:null,
    observation:'controller-received-progress; not proof of host integrity or native crash'
  };
}
// This option belongs to the sealed, external launch configuration. A host request
// cannot select it. Retention preserves evidence, never readiness or authority.
function retainManualEvidence(config) {
  return config.manualEvidenceRetention === true && config.researchLab === true
    && config.researchMode === 'observe-only' && config.externalControl === true
    && config.host?.lowIntegrity === true
    && config.admission?.hostMutation === 'disabled'
    && config.admission?.quarantineOnFault === true
    && config.host.args?.some(x => /^-Deff\.manualCombat=(pig2|foreverlove)$/.test(x));
}
module.exports={describeHostFault,retainManualEvidence};
