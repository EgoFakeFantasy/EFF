# Player function evidence

An original object retaining its UUID, Java identity, registry membership and health
does not prove that it is still ticking, colliding, rendering or accepting input.
`player-functional-evidence.cjs` supplements the existing baseline and gameplay
checks. It never edits game state and never returns a combat pass.

The reviewer requires a covered, unpaused trace and checks each side separately:

- An aged server publication is `STALE_SERVER_SNAPSHOT`. It is not a fresh
  observation of the player, and cannot establish that the player itself stopped.
- Repeated publication of the same server snapshot does not advance the tick
  observation clock. Distinct fresh observations with an unchanged tick count for
  at least five seconds produce `PLAYER_TICK_STALLED`.
- Missing originals, changed identities, unreadable counters, backwards counters,
  trace gaps and unknown pause/freshness state remain explicit issues. Java int
  wrap from MAX_VALUE to MIN_VALUE is allowed.
- Client/server position disagreement is reported quantitatively, without calling
  it deletion or assuming an attack caused it. Network delay can also cause it.

`reviewPlayerGameplay` now rejects a functional issue before allowing a precombat
baseline handoff. This is an evidence check, not a repair or a runtime defense.
The five-second/2-second sampling thresholds are acceptance-policy tolerances,
not security boundaries. An attacker in the same process can tamper with samples;
the unchanged original window, actual input response and timestamp-aligned video
must still be checked independently. Rendering may be substituted without changing
the stored screen field, and valid position fields do not prove correct collisions.

Run the tests with:

```text
node --test mc-1.20.1/runtime/guard/player-functional-evidence.test.cjs mc-1.20.1/runtime/guard/player-gameplay-evidence.test.cjs mc-1.20.1/runtime/guard/manual-baseline-evidence.test.cjs
```
