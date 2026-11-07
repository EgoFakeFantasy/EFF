# EFF manual-candidate state snapshot

This optional diagnostic agent uses the supported JDK Attach API. It registers no transformer, requests no redefinition capability and performs no entity repair. It reads a fixed list of EFF fields. Its cross-thread output is not an atomic game snapshot or proof of integrity. The agent is not part of the normal mod or guardian distribution.

The target must already have `eff.manualCombat=foreverlove` or `pig2`. The caller must verify PID, process creation time and original window ownership before attachment. The output uses `CREATE_NEW`; an existing observation is never overwritten. Do not relax runtime admission or host security settings if attachment is refused.

The v65d experiment returned from `loadAgent` but produced no output file. That is **not proof that the agent ran**. The cause remains unestablished. The test candidate is labeled as having undergone an attach diagnostic attempt and is not accepted as a clean combat baseline. Prefer the bounded built-in `BootstrapDiagnostics.state` records on the next candidate.

Offline tests cover JSON escaping, output bounds, the field allowlist and unchanged fixture state. They do not prove execution inside a modified MC runtime.
