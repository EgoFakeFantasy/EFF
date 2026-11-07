# Trusted connection tick candidate

The original player can retain health and registry membership while its normal
server tick dispatch is skipped. Write barriers on health and tickCount cannot
force a skipped method to execute. This candidate protects one execution route:
`ServerGamePacketListenerImpl.m_9933_()V` for the currently claimed original player.

## Operation

The existing final Java transformation boundary inserts an ownership branch ahead
of the supplied method body. If `FieldWriteGate.rejectQuery` recognizes the exact
active original player stored in that connection, the method executes the reviewed
Forge connection tick body. Otherwise it executes the entire supplied body.

The protected branch executes normal player tick dispatch, synchronization,
keepalive, idle checks and ordinary connection work. It does not increment the
player timer separately, run a second tick, reset position, heal, recreate or
register an entity. Releasing the claim restores the supplied flow on the next
invocation. Exceptions in the ownership check cannot be swallowed by a foreign
handler around the previous body.

The template comes from the local **Forge 47.4.20 client JAR**, not the vanilla SRG
JAR. Its class SHA-256 is:

```text
8bcf74fa649eeec89b4f22726da82f64db2d7e6dbc05e96e300e349daca04649
```

The build extracts and verifies it; runtime verifies the packaged resource again.
Missing or changed templates fail the candidate instead of choosing a fallback.
No Minecraft class bytes are checked into this source directory. Another Forge
version requires a reviewed template; the candidate does not assert universal
47.4.20+ compatibility.

Class schema is retained. Receiver field/method descriptors and staticness are
checked before insertion. Exact executable instructions, frame information, branch
destinations and exception edges are compared before treating an existing head as
intact. A marker alone is not a seal. A corrupted earlier prefix is retained as an
unreached tail for active originals, with a newly guarded head inserted before it;
no foreign labels are removed or redirected.

## Tests and limits

`test/run-trusted-tick.py` executes generated JVM fixtures with `-Xverify:all`:
exactly one player tick per invocation, normal connection work, non-owned tail,
claim release, same original identity, unchanged schema, call substitution under
retained markers, overlapping foreign exception handlers, and missing fields.
It also checks transformation/idempotence against the actual Forge class shape.
The composed owned-agent tests run separately before candidate packaging.

The new transformer itself is included in the pinned provider class set. The
bootstrap dispatcher now routes this one additional MC class to the final pass.

This is intentionally a narrow compatibility tradeoff: arbitrary third-party
rewrites of this connection method do not run on the protected branch. It does
not promise to preserve every Mixin or callback inserted into that method.
Forge behavior inside the reviewed body is retained; downstream methods can still
be hooked. Unclaimed connections retain the full existing method body.

It does not yet protect the entire server loop, collision queries, rendering,
all downstream player methods or native writes beyond the existing boundaries.
Offline tests do not prove continuous game survival. Normal movement and a fresh,
recorded same-JVM attack must be verified separately; restart or recreated objects
cannot satisfy that test.
