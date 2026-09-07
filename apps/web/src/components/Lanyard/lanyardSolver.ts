import * as THREE from 'three';

/**
 * Position-based dynamics solver for the lanyard: a 4-point rope chain plus a
 * rigid card hanging off its end.
 *
 * This is a drop-in replacement for the Rapier setup in `Lanyard.tsx`, which
 * costs ~843 kB gzip because `@dimforge/rapier3d-compat` inlines its WASM as
 * base64. The scene only ever needed four rope joints and one ball joint, so
 * the general-purpose engine is replaced here by the two constraints it was
 * actually being asked to solve.
 *
 * Parity notes with the Rapier version:
 *  - `useRopeJoint(a, b, [.., .., 1])` is a *maximum* distance constraint, not
 *    a rigid rod: segments go slack, so `solveRope` only acts when stretched.
 *  - `useSphericalJoint(j3, card, [[0,0,0], [0,1.45,0]])` pins the card's local
 *    point (0, 1.45, 0) — the clip — to the last bead. Solving it against the
 *    card's inertia tensor (rather than its centre of mass) is what produces
 *    the swing and twist; an axis-by-axis approximation reads as rubbery.
 *  - Rapier applies damping as `v /= (1 + damping * dt)`, reproduced verbatim.
 *  - Masses come from Rapier's implicit density of 1: the ball colliders
 *    (r = 0.1) and the card cuboid (0.8 x 1.125 x 0.01 half-extents) give the
 *    card ~17x the mass of a bead, which is why the rope whips around it.
 */

const BEAD_RADIUS = 0.1;
const CARD_HALF = new THREE.Vector3(0.8, 1.125, 0.01);

// Rapier derives mass from collider volume at density 1.
const BEAD_MASS = (4 / 3) * Math.PI * BEAD_RADIUS ** 3;
const CARD_MASS = 8 * CARD_HALF.x * CARD_HALF.y * CARD_HALF.z;

export const SEGMENT_LENGTH = 1;
export const ANCHOR = new THREE.Vector3(0, 3.92, 0);
export const CARD_ANCHOR_LOCAL = new THREE.Vector3(0, 1.45, 0);

const GRAVITY = -33;
const LINEAR_DAMPING = 4;
const ANGULAR_DAMPING = 4;

/** Bead count including the pinned one at index 0. */
const BEAD_COUNT = 4;

// Inertia of a solid box about its centre, per unit mass.
function boxInvInertia(half: THREE.Vector3, mass: number): THREE.Vector3 {
  const x = 2 * half.x;
  const y = 2 * half.y;
  const z = 2 * half.z;
  const ix = (mass / 12) * (y * y + z * z);
  const iy = (mass / 12) * (x * x + z * z);
  const iz = (mass / 12) * (x * x + y * y);
  return new THREE.Vector3(1 / ix, 1 / iy, 1 / iz);
}

const CARD_INV_INERTIA_LOCAL = boxInvInertia(CARD_HALF, CARD_MASS);

// --- scratch -------------------------------------------------------------
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c = new THREE.Vector3();
const _lambda = new THREE.Vector3();
const _dtheta = new THREE.Vector3();
const _anchorWorld = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _rotM = new THREE.Matrix3();
const _m4 = new THREE.Matrix4();
const _invIw = new THREE.Matrix3();
const _skew = new THREE.Matrix3();
const _tmpM = new THREE.Matrix3();
const _k = new THREE.Matrix3();

function setSkew(out: THREE.Matrix3, v: THREE.Vector3): THREE.Matrix3 {
  return out.set(0, -v.z, v.y, v.z, 0, -v.x, -v.y, v.x, 0);
}

/** World-space inverse inertia tensor: R * diag(invI) * R^T. */
function invInertiaWorld(out: THREE.Matrix3, q: THREE.Quaternion, invI: THREE.Vector3): THREE.Matrix3 {
  _rotM.setFromMatrix4(_m4.makeRotationFromQuaternion(q));
  const e = _rotM.elements; // column-major
  // rows of R
  const r00 = e[0], r01 = e[3], r02 = e[6];
  const r10 = e[1], r11 = e[4], r12 = e[7];
  const r20 = e[2], r21 = e[5], r22 = e[8];
  const a = invI.x, b = invI.y, c = invI.z;
  // (R * diag) * R^T
  return out.set(
    r00 * a * r00 + r01 * b * r01 + r02 * c * r02,
    r00 * a * r10 + r01 * b * r11 + r02 * c * r12,
    r00 * a * r20 + r01 * b * r21 + r02 * c * r22,
    r10 * a * r00 + r11 * b * r01 + r12 * c * r02,
    r10 * a * r10 + r11 * b * r11 + r12 * c * r12,
    r10 * a * r20 + r11 * b * r21 + r12 * c * r22,
    r20 * a * r00 + r21 * b * r01 + r22 * c * r02,
    r20 * a * r10 + r21 * b * r11 + r22 * c * r12,
    r20 * a * r20 + r21 * b * r21 + r22 * c * r22,
  );
}

function integrateQuaternion(
  out: THREE.Quaternion,
  q: THREE.Quaternion,
  omega: THREE.Vector3,
  dt: number,
): THREE.Quaternion {
  const h = 0.5 * dt;
  const { x: wx, y: wy, z: wz } = omega;
  out.set(
    q.x + h * (wx * q.w + wy * q.z - wz * q.y),
    q.y + h * (wy * q.w + wz * q.x - wx * q.z),
    q.z + h * (wz * q.w + wx * q.y - wy * q.x),
    q.w + h * (-wx * q.x - wy * q.y - wz * q.z),
  );
  return out.normalize();
}

export interface SolverOptions {
  /** Physics steps per rendered frame. More substeps = stiffer rope. */
  substeps?: number;
  /** Gauss-Seidel passes inside each substep. */
  iterations?: number;
  /** Fixed timestep, matching Rapier's `timeStep` prop. */
  fixedDt?: number;
  /** XPBD compliance of the rope segments (see ROPE_COMPLIANCE). */
  ropeCompliance?: number;
  /** XPBD compliance of the card's ball joint (see JOINT_COMPLIANCE). */
  jointCompliance?: number;
  /** Max rope correction per solver iteration (see ROPE_MAX_CORRECTION). */
  ropeMaxCorrection?: number;
  /** Max ball-joint correction per solver iteration (see JOINT_MAX_CORRECTION). */
  jointMaxCorrection?: number;
}

/**
 * Compliance (inverse stiffness) for the two constraints.
 *
 * A pure position-based projection is *stiffer* than Rapier: measured against
 * the real engine, Rapier lets the rope stretch to 2.9x its rest length during
 * the entry drop and carries ~0.14 of residual ball-joint error, because its
 * TGS solver runs only 4 iterations on a chain with a 17:1 mass ratio. Snapping
 * the constraints exactly makes the card arrive too fast and skips the recoil.
 *
 * XPBD compliance reintroduces exactly that give, as a spring rather than as an
 * under-solved constraint. The values below were fitted against a headless
 * Rapier run over the entry drop and a drag-and-release swing (grid search on
 * trajectory RMS, over both the 1/60 and the 1/30 configuration). At rest the
 * tension is ~2.4 N, so they buy back around 2 mm of stretch — invisible when
 * hanging, and only felt during violent motion. The joint value sits in a flat
 * region of the fit; it is kept small and non-zero to keep the 3x3 solve well
 * conditioned rather than for its effect on the motion.
 */
const ROPE_COMPLIANCE = 9e-4;
const JOINT_COMPLIANCE = 1e-6;

/**
 * Caps on how much a single solver iteration may move things (world units) —
 * the equivalent of Box2D's `b2_maxLinearCorrection`.
 *
 * The rope cap is what shapes the entry animation. The card is mounted at
 * (2, 7, 1) with its clip ~8.4 units from the last bead; an unclamped
 * projection resolves that in one frame, which reads as a pop, while Rapier
 * bleeds it off over ~2.5s and the swoop is the nicest part of the animation.
 * With the cap in place the two settle within 0.15s of each other.
 *
 * The two caps must be separate. A single shared cap that is loose enough to
 * reproduce the swoop also lets the ball joint lag, and the card visibly
 * detaches from the end of the band during the entry (measured: 0.71 of
 * separation on desktop, 2.12 on mobile, against Rapier's own worst of 0.14).
 * So the joint stays effectively unclamped and the rope carries the softness —
 * which is what Rapier does too: it stretches the rope to 2.9x rest length
 * under the same shock while holding the joint tight.
 *
 * Holding the joint that tight does make the off-centre correction land as a
 * sharper torque, but measured over the entry the card ends up tumbling almost
 * exactly as much as Rapier's (61% of the first 3s spent more than 60 deg off
 * camera, against 56%); it simply tumbles out of phase, the entry being chaotic
 * in both. An angular cap was tried and dropped: it cut the tumble to 22% and
 * moved *away* from the reference.
 *
 * At rest both errors are orders of magnitude below these values, so neither
 * cap engages during normal motion.
 */
const ROPE_MAX_CORRECTION = 0.7;
const JOINT_MAX_CORRECTION = 1e3;


export class LanyardSolver {
  /** Bead positions, index 0 pinned to ANCHOR. */
  readonly beads: THREE.Vector3[] = [];
  /** Smoothed bead positions used to draw the band (mirrors the Rapier code). */
  readonly lerped: THREE.Vector3[] = [];

  readonly cardPosition = new THREE.Vector3();
  readonly cardQuaternion = new THREE.Quaternion();

  private readonly beadVel: THREE.Vector3[] = [];
  private readonly pred: THREE.Vector3[] = [];
  private readonly invMass: number[] = [];

  private readonly cardVel = new THREE.Vector3();
  private readonly cardOmega = new THREE.Vector3();
  private readonly cardPred = new THREE.Vector3();
  private readonly cardPredQ = new THREE.Quaternion();

  private accumulator = 0;

  substeps: number;
  iterations: number;
  fixedDt: number;
  ropeCompliance: number;
  jointCompliance: number;
  ropeMaxCorrection: number;
  jointMaxCorrection: number;

  /** XPBD multipliers, accumulated across the iterations of one substep. */
  private readonly ropeLambda = [0, 0, 0];
  private readonly jointLambda = new THREE.Vector3();

  /** When set, the card is driven to this position and treated as infinite mass. */
  private kinematicTarget: THREE.Vector3 | null = null;
  private readonly kinematicFrom = new THREE.Vector3();
  private readonly kinematicStep = new THREE.Vector3();

  constructor(options: SolverOptions = {}) {
    this.substeps = options.substeps ?? 8;
    this.iterations = options.iterations ?? 2;
    this.fixedDt = options.fixedDt ?? 1 / 60;
    this.ropeCompliance = options.ropeCompliance ?? ROPE_COMPLIANCE;
    this.jointCompliance = options.jointCompliance ?? JOINT_COMPLIANCE;
    this.ropeMaxCorrection = options.ropeMaxCorrection ?? ROPE_MAX_CORRECTION;
    this.jointMaxCorrection = options.jointMaxCorrection ?? JOINT_MAX_CORRECTION;
    this.reset();
  }

  reset(): void {
    this.beads.length = 0;
    this.lerped.length = 0;
    this.beadVel.length = 0;
    this.pred.length = 0;
    this.invMass.length = 0;

    for (let i = 0; i < BEAD_COUNT; i += 1) {
      // Same starting layout as the Rapier bodies: 0, 0.5, 1, 1.5 on X.
      const p = new THREE.Vector3(i * 0.5, 0, 0).add(ANCHOR);
      this.beads.push(p);
      this.lerped.push(p.clone());
      this.beadVel.push(new THREE.Vector3());
      this.pred.push(p.clone());
      this.invMass.push(i === 0 ? 0 : 1 / BEAD_MASS);
    }

    this.cardPosition.set(2, 7, 1).add(ANCHOR);
    this.cardQuaternion.identity();
    this.cardVel.set(0, 0, 0);
    this.cardOmega.set(0, 0, 0);
    this.accumulator = 0;
    this.kinematicTarget = null;
  }

  setKinematicTarget(target: THREE.Vector3 | null): void {
    this.kinematicTarget = target;
  }

  get isKinematic(): boolean {
    return this.kinematicTarget !== null;
  }

  /**
   * Advance the simulation by `delta` seconds using a fixed-step accumulator,
   * so behaviour does not change with display refresh rate.
   */
  update(delta: number): void {
    // Cap the backlog: a backgrounded tab must not replay minutes of physics.
    this.accumulator = Math.min(this.accumulator + delta, this.fixedDt * 5);
    const steps = Math.floor(this.accumulator / this.fixedDt);
    if (steps === 0) return;
    this.accumulator -= steps * this.fixedDt;

    // While dragging, walk the card towards the pointer across every substep
    // instead of teleporting it on the first one. Rapier gets away with the
    // teleport because it takes a single step per frame; here it would leave
    // the card with zero velocity on release, killing the throw.
    const total = steps * this.substeps;
    if (this.kinematicTarget) {
      this.kinematicFrom.copy(this.cardPosition);
      this.kinematicStep.subVectors(this.kinematicTarget, this.kinematicFrom).divideScalar(total);
    }

    const h = this.fixedDt / this.substeps;
    for (let s = 0; s < total; s += 1) {
      if (this.kinematicTarget) {
        this.kinematicStep
          .copy(this.kinematicTarget)
          .sub(this.kinematicFrom)
          .multiplyScalar((s + 1) / total)
          .add(this.kinematicFrom);
      }
      this.substep(h, this.kinematicTarget ? this.kinematicStep : null);
    }
  }

  private substep(dt: number, kinematic: THREE.Vector3 | null): void {
    const damp = 1 / (1 + LINEAR_DAMPING * dt);

    for (let i = 1; i < BEAD_COUNT; i += 1) {
      const v = this.beadVel[i];
      v.y += GRAVITY * dt;
      v.multiplyScalar(damp);
      this.pred[i].copy(this.beads[i]).addScaledVector(v, dt);
    }
    this.pred[0].copy(ANCHOR);

    if (kinematic) {
      this.cardPred.copy(kinematic);
      this.cardPredQ.copy(this.cardQuaternion);
    } else {
      this.cardVel.y += GRAVITY * dt;
      this.cardVel.multiplyScalar(damp);
      this.cardOmega.multiplyScalar(1 / (1 + ANGULAR_DAMPING * dt));
      this.cardPred.copy(this.cardPosition).addScaledVector(this.cardVel, dt);
      integrateQuaternion(this.cardPredQ, this.cardQuaternion, this.cardOmega, dt);
    }

    // XPBD multipliers are per-substep: reset them, then let the iterations
    // accumulate towards the compliant solution.
    this.ropeLambda[0] = this.ropeLambda[1] = this.ropeLambda[2] = 0;
    this.jointLambda.set(0, 0, 0);

    const invDt2 = 1 / (dt * dt);
    const ropeAlpha = this.ropeCompliance * invDt2;
    const jointAlpha = this.jointCompliance * invDt2;

    const cardInvMass = kinematic ? 0 : 1 / CARD_MASS;
    for (let it = 0; it < this.iterations; it += 1) {
      for (let i = 0; i < BEAD_COUNT - 1; i += 1) {
        this.solveRope(i, i + 1, ropeAlpha);
      }
      this.solveBallJoint(cardInvMass, jointAlpha);
    }

    const invDt = 1 / dt;
    for (let i = 1; i < BEAD_COUNT; i += 1) {
      this.beadVel[i].subVectors(this.pred[i], this.beads[i]).multiplyScalar(invDt);
      this.beads[i].copy(this.pred[i]);
    }
    this.beads[0].copy(ANCHOR);

    this.cardVel.subVectors(this.cardPred, this.cardPosition).multiplyScalar(invDt);
    this.cardPosition.copy(this.cardPred);

    if (!kinematic) {
      _qInv.copy(this.cardQuaternion).invert();
      _dq.copy(this.cardPredQ).multiply(_qInv);
      const sign = _dq.w < 0 ? -1 : 1;
      this.cardOmega.set(_dq.x, _dq.y, _dq.z).multiplyScalar(2 * invDt * sign);
      this.cardQuaternion.copy(this.cardPredQ);
    } else {
      // Rapier's `kinematicPosition` bodies ignore angular velocity, so the
      // card holds its orientation while dragged. Matching that on purpose.
      this.cardOmega.set(0, 0, 0);
    }
  }

  /** Maximum-distance (rope) constraint between two beads, XPBD form. */
  private solveRope(ia: number, ib: number, alpha: number): void {
    const a = this.pred[ia];
    const b = this.pred[ib];
    const wa = this.invMass[ia];
    const wb = this.invMass[ib];
    const w = wa + wb;
    if (w === 0) return;

    _d.subVectors(b, a);
    const len = _d.length();
    if (len <= SEGMENT_LENGTH || len === 0) return; // slack: rope, not rod

    _n.copy(_d).multiplyScalar(1 / len);
    const c = Math.min(len - SEGMENT_LENGTH, this.ropeMaxCorrection);
    const lambda = this.ropeLambda[ia];
    const dLambda = (-c - alpha * lambda) / (w + alpha);
    this.ropeLambda[ia] = lambda + dLambda;

    a.addScaledVector(_n, -wa * dLambda);
    b.addScaledVector(_n, wb * dLambda);
  }

  /**
   * Ball joint pinning the card's local clip point to the last bead.
   *
   * Solves the full 3x3 effective-mass system
   *   K = (w_bead + w_card) * I  +  [r]^T * invI_world * [r]
   * so the correction accounts for the card's inertia. Doing this per-axis
   * instead makes the card feel like it is on a spring.
   */
  private solveBallJoint(cardInvMass: number, alpha: number): void {
    const last = BEAD_COUNT - 1;
    const bead = this.pred[last];
    const wBead = this.invMass[last];
    if (wBead === 0 && cardInvMass === 0) return;

    _r.copy(CARD_ANCHOR_LOCAL).applyQuaternion(this.cardPredQ);
    _anchorWorld.copy(this.cardPred).add(_r);
    // XPBD residual: C plus the compliance term for what is already applied.
    _c.subVectors(_anchorWorld, bead).addScaledVector(this.jointLambda, -alpha);
    const cLen = _c.length();
    if (cLen < 1e-7) return;
    if (cLen > this.jointMaxCorrection) _c.multiplyScalar(this.jointMaxCorrection / cLen);

    invInertiaWorld(_invIw, this.cardPredQ, CARD_INV_INERTIA_LOCAL);
    setSkew(_skew, _r);

    // [r]^T * invIw * [r], with [r]^T = -[r]
    _tmpM.copy(_invIw).multiply(_skew);
    _k.copy(_skew).multiply(_tmpM).multiplyScalar(-1);

    const diag = wBead + cardInvMass + alpha;
    const e = _k.elements;
    e[0] += diag;
    e[4] += diag;
    e[8] += diag;
    // Regularise: a perfectly flat card has a near-singular inertia axis.
    const eps = 1e-9 * (Math.abs(e[0]) + Math.abs(e[4]) + Math.abs(e[8]) + 1);
    e[0] += eps;
    e[4] += eps;
    e[8] += eps;

    _lambda.copy(_c).applyMatrix3(_tmpM.copy(_k).invert());
    this.jointLambda.add(_lambda);

    bead.addScaledVector(_lambda, wBead);
    if (cardInvMass > 0) {
      this.cardPred.addScaledVector(_lambda, -cardInvMass);
      // Angular impulse from applying -lambda at offset r.
      _dtheta.crossVectors(_r, _lambda).applyMatrix3(_invIw).multiplyScalar(-1);
      _dq.set(_dtheta.x, _dtheta.y, _dtheta.z, 0).multiply(this.cardPredQ);
      this.cardPredQ.set(
        this.cardPredQ.x + 0.5 * _dq.x,
        this.cardPredQ.y + 0.5 * _dq.y,
        this.cardPredQ.z + 0.5 * _dq.z,
        this.cardPredQ.w + 0.5 * _dq.w,
      ).normalize();
    }
  }

  /**
   * Gentle yaw restoring torque so the card settles facing the camera.
   *
   * The Rapier version does `angvel.y -= quaternion.y * 0.25` once per rendered
   * frame, which silently doubles on a 120 Hz display; scaling by `delta * 60`
   * keeps the 60 Hz behaviour identical and makes it refresh-rate independent.
   */
  applyYawRestore(delta: number): void {
    if (this.isKinematic) return;
    this.cardOmega.y -= this.cardQuaternion.y * 0.25 * Math.min(delta * 60, 4);
  }

  /**
   * Smooths the two middle beads before they are fed to the band curve —
   * same easing (and same magic numbers) as the Rapier implementation.
   */
  updateBandSmoothing(delta: number, minSpeed: number, maxSpeed: number): void {
    for (let i = 1; i <= 2; i += 1) {
      const lerped = this.lerped[i];
      const target = this.beads[i];
      const clamped = Math.max(0.1, Math.min(1, lerped.distanceTo(target)));
      lerped.lerp(target, Math.min(1, delta * (minSpeed + clamped * (maxSpeed - minSpeed))));
    }
  }
}
