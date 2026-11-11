# Archer animation improvement plan

1. Establish a consistent local frame: the unflipped archer, bow, arrow tip and feet all face left; mirror the whole character for rightward movement. While standing armed or drawing, face the target.
2. Replace rigid leg swings with shared hip, knee, ankle and toe geometry. Alternate contact and lift, increase stride/lift and cadence for running, and keep the boots near the ground. Hold Shift (or touch RUN) to run.
3. Carry the bow diagonally across the torso when not drawing. Raise it to the aiming angle on draw, retain the established shot trajectory, and sweep arrow fletching back toward the tail. The hat can be toggled in the inspector.
4. Expose the same rig geometry in the animation lab: compare two poses, flip facing, pause/scrub the cycle, toggle the skeleton and gear, and inspect joint and bow coordinates. The lab pauses an active game and resumes only if it paused it.
5. Regression-check direction, gait phases and relative run stride, arrow geometry and a sweet-spot shot with `npm test`; run `npm run build` and `npx tsc --noEmit`. For visual review, open the inspector from the title or the gear button in-game, compare walk/run and idle/draw in both directions, scrub contact/lift and check the optional hat. The preview shows ideal pose geometry; the game interpolates upper-body transitions.

The skeleton overlay is diagnostic, not a physics simulation: joints are procedural and feet are not inverse-kinematic constraints. Gameplay shots always target the left-hand target, even after moving right.
