# Manual player attack sampling

The opt-in `efflab-player prepare` command warms the existing management probe on
a daemon. `strike` refuses to attack until that probe is ready, then binds the exact
current server Thread before invoking the normal player attack path. Sampling does
not discover threads by name or enumerate unrelated threads.

The manual fixture uses the new server-only path. Its report explicitly records a
null renderer identity; it must not be read as a render-thread trace. Reports retain
the trial run ID, thread ID, wall/monotonic sampling start, stack frames, thread state,
and lock owner ID. The worker has a 3-second scheduling budget, at most 60 samples,
24 frames per thread and bounded strings. A management API call can itself be slow;
elapsed/sampling durations must be checked rather than treating this budget as a
hard native-call timeout. The worker is a daemon and never waits on the game thread.

No target method is invoked by the sampler, no thread is suspended or terminated,
and no entity state is restored. Permission failures, unavailable samples and
unexpected thread array shapes are diagnostic failures, not survival evidence.
Existing dual-thread automatic fixtures retain their original exact binding checks.

The report describes sampled execution only. It cannot prove an unsampled path did
not run, nor establish trusted execution against arbitrary same-process native
tampering. Combine it with original object/window identities, fresh functional
observations, live method snapshots and the recorded attack.
