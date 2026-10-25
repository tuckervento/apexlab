# Constant-grip race

`race(T, car, dc, line, v, options)` uses the same inputs as `dynLap`.
Import it from `src/race/index.js`. The default driver is `referenceDriver`.
Driver methods are `init(context)`, `step(state, observation)` and optional
`lap(state, summary)`. Driver inputs are copies; plant state never escapes during a run.

Options: `laps` (3), `driver`, `incidentPolicy` (`'reset'` or `'dnf'`),
`incidentPenalty` (5 seconds), `resetStations` (3), `resetSpeed` (0.7 of plan),
`warnings` (3 track-limit excursions per penalty), `trackPenalty` (5 seconds),
`maxTime` (900 seconds per requested lap plus formation).
These are provisional configurable rules, not calibrated racing penalties.

The default policy resets an off/spin onto the line ahead with reduced nominal
velocity. The next observation has `incident: 1`. A reset that wraps past station
zero scores a crossing at incident time, including when it lands exactly on zero;
that crossing is counted only once. DNF ends immediately at the first off/spin.
Formation incidents
are recorded and their penalties charged to lap one. Track limits count entries
past 0.5 m beyond the usable edge, rearming upon return. An off also counts as a
track-limit excursion and can trigger both penalties. Off means over 3 m;
spin means velocity over 0.45 radians from body heading or circuit tangent.
The judge uses circuit geometry and plant state, never the driver's line angles.

Rolling placement follows dynLap's straightest seven-station window. The first
forward crossing of station zero starts timing; N further crossings finish N laps.
Crossings use a directed plane through line station zero and linear interpolation
within the 4 ms integration step. All plant and driver state carries across laps.
`crossings` includes the formation crossing; `lapTimes` includes penalties;
`drivingTime` excludes penalties; `total` includes them. `complete`, `dnf`,
`violations`, `incidents` and a final plant-state copy describe the outcome.
A time-limit expiry is a DNF. Observations use lap 0 for formation and 1..N for timed laps.
Lap callbacks run after each completed timed lap; summary incidents belong only to
that lap, with formation incidents included in lap one.

Verification: `node --test tests/race.test.mjs` and
`node tests/check-race-mutations.mjs`. The latter deliberately breaks separate
APEX_SRC copies and asserts each required property fails before discarding them.
Race source is deliberately outside the physics hash in this phase.
