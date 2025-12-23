# Multi-Agent Collision Experiment (Two-Field Comparison)

This repository contains an interactive simulation designed to study **collision statistics, motion efficiency, and slowdown effects** in a dense multi-agent system.

The experiment compares two identical populations of moving agents (“balls”) under identical physical conditions but **different control regimes**:

- **Left field** — baseline motion *without* collision avoidance  
- **Right field** — motion *with* collision-avoidance mechanisms enabled  

The goal is to assess collision rates and motion efficiency of an avoidance algorithm.

---

## Overview of the Experiment

Each field contains the same number of balls moving simultaneously inside a square arena.

- All balls:
  - Have the same radius
  - Move with bounded speed
  - Repeatedly travel toward randomly assigned targets
  - Are re-assigned a new target immediately after reaching the current one

The two fields differ **only** in how motion directions are adjusted to avoid collisions.

---

## Geometry and Physical Parameters

| Parameter | Meaning |
|---------|--------|
| `R` | Ball radius |
| `BASE_SPEED = R` | Base movement speed |
| Arena size | 500 × 500 |
| Number of balls | 50 |
| Collision distance | `< R` |
| Vision radius | `10 × R` |

---

## How the Balls Move

Each ball follows the same high-level motion cycle:

1. A random target point is selected inside the arena.
2. The ball moves toward the target with bounded turning angle and bounded speed change.
3. When the ball reaches the target (distance ≤ `1.5 × step_size`), a new target is chosen.
4. The number of frames spent traveling to the target is recorded.

### Motion Constraints

- Maximum turn per frame: **±45°**
- Speed changes are discrete and bounded
- Movement is clamped near arena borders

---

## Left vs Right Field

### Left Field (Baseline)

- Balls **always** move directly toward their targets.
- No collision prediction or avoidance is applied.
- Serves as a reference for:
  - Collision frequency
  - Average travel time to target

### Right Field (Avoidance Enabled)

- Balls may modify their direction and speed to reduce collisions.
- Avoidance logic operates locally and predictively.
- Internal logic is layered and adaptive.

---

## Vision Radius (Local Information)

Balls do **not** have global knowledge.

Each ball:
- Only “sees” neighbors within a **vision radius**
- Vision radius = **10 × R**
- Only neighbors inside this radius are considered in:
  - Collision prediction
  - Joint decision making

---


## Visual Tracking Aids (Green Ball, Target, Vision Field)

To make the dynamics of the system easier to follow by eye, the simulation highlights **one arbitrary ball** in each field.

### Green Ball (Tracked Agent)

- One ball is colored **green**
- This ball is **not special** in any algorithmic sense
- It follows exactly the same rules as all other balls
- Its purpose is purely **visual tracking**

The green ball allows the observer to:
- Follow a single agent continuously
- Visually assess how avoidance affects its trajectory
- Compare behavior between the left and right fields

---

### Gray Target Marker

For the green ball, its current target is explicitly visualized:

- The target is shown as a **gray cross inside a gray circle**
- This marker indicates **where the ball is currently trying to go**
- When the ball reaches this target, a new one is immediately assigned

The target visualization helps distinguish:
- Deviations caused by collision avoidance
- Natural direction changes due to target switching

---

### Vision Field (Gray Circle)

Around the green ball, a **faint gray circle** is drawn.

This circle represents the **vision radius** of the ball:

- Radius = **10 × R**
- Only balls inside this circle are:
  - Visible to the green ball
  - Considered in collision prediction
- Balls outside this circle are completely ignored by the ball’s decision process

This visualization emphasizes that:
- The system operates on **local information only**
- No ball has global awareness of the field
- Collective behavior emerges from overlapping local neighborhoods

---

### Why This Matters

Together, the green ball, its target marker, and its vision field make it possible to:

- Intuitively understand local perception constraints
- See how avoidance alters trajectories relative to the target
- Observe congestion and interaction effects forming dynamically

These visual aids are **diagnostic tools only** and do not affect the experiment’s logic or statistics.

---

## What Counts as a Collision

A collision is defined geometrically: distance between centers < R


### Collision Counting Rules

To ensure meaningful statistics, **not all collisions are counted**.

A collision is **counted** only if:

- Both balls are:
  - At least `2 × BASE_SPEED` away from arena borders
  - Not in the immediate vicinity of a target

A collision is **ignored** if it occurs:

1. **Near targets**
   - When a ball reaches a target, its direction can change abruptly
   - These sudden turns make collision outcomes unpredictable
2. **Near arena borders**
   - Balls lack maneuvering space
   - Collisions are strongly geometry-forced rather than control-related

This filtering ensures collision statistics reflect **interaction dynamics**, not boundary artifacts.

---

## Collision Metrics

### Collisions per 10 Seconds

- A sliding 10-second window is used
- Each newly appearing colliding pair contributes one event
- Persistent overlaps are counted once

This metric captures **collision intensity**, not raw contact duration.

---

## Average Distance (Frames) to Target

This metric answers a key question:

> *How much do collision-avoidance behaviors slow the system down?*

### Definition

- For each completed trip to a target:
  - Count the number of frames taken
- Average over all completed trips

### Interpretation

- **Lower value** → more efficient motion
- **Higher value** → stronger slow-down due to avoidance

Comparing left and right fields directly shows the **cost of safety**.

---

## Experimental Intent

This experiment is designed to study:

- Trade-offs between collision avoidance and motion efficiency
- Emergent congestion effects
- Local vs collective interactions
- The impact of limited perception

It is **not** intended as:
- A physics-accurate collision simulator
- A robotics controller
- A finalized navigation algorithm

---

## Interaction

Keyboard controls:

- **Space** — resume after pause
- **H** — toggle visualization of interaction components
- **L** — toggle logging of interaction structure
- **+/-** — increase/decrease visualization speed

When a significant collision occurs in the right field, the simulation pauses and automatically generates diagnostic snapshots and logs for post-analysis.

---

## Files

- Single self-contained HTML file
- No build system
- No external backend
- Runs directly in the browser




