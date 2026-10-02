import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { useGLTF, useTexture, Environment, Lightformer, Html } from '@react-three/drei';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import QRCode from 'qrcode';
import type { TicketViewData } from '@underclub/shared';
import { LanyardSolver } from './lanyardSolver';

/**
 * The ticket lanyard. Rope and card are simulated by `lanyardSolver.ts`, a
 * dedicated XPBD solver that replaced Rapier (~840 kB gz of inlined WASM).
 *
 * `LanyardRapier.tsx` keeps the previous implementation, reachable only on
 * /lanyard-rapier. Rendering is kept identical between the two on purpose (same
 * GLB, materials, meshline band and HTML overlay), so any difference seen when
 * comparing them comes from the physics alone.
 */

const CARD_MODEL_URL = '/ticket/_Card.glb';
const LANYARD_TEXTURE_URL = '/ticket/_lanyard.png';

extend({ MeshLineGeometry, MeshLineMaterial });

const MOCK_TICKET: TicketViewData = {
  reservationId: '00000000-0000-0000-0000-000000000000',
  fullName: 'Stevens Payano',
  email: 'stevensonpayano@icloud.com',
  eventDate: 'MARCH 07',
  eventName: 'TECHNOROOM',
  entryName: '10 € + 1 DRINK'
};

interface LanyardProps {
  position?: [number, number, number];
  fov?: number;
  transparent?: boolean;
  ticketData?: TicketViewData;
  qrToken?: string | null;
  /** Bumping this remounts the band and drops the card again. */
  resetKey?: number;
}

export default function Lanyard({
  position = [0, 0, 11],
  fov = 24,
  transparent = true,
  ticketData = MOCK_TICKET,
  qrToken = null,
  resetKey = 0,
}: LanyardProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = (): void => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative z-0 h-full w-full min-h-0 overflow-hidden flex justify-center items-center">
      <Canvas
        camera={{ position, fov }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: transparent }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1)}
      >
        <ambientLight intensity={Math.PI} />
        <Band key={resetKey} isMobile={isMobile} ticketData={ticketData} qrToken={qrToken} />
        <Environment>
          <Lightformer
            intensity={15}
            position={[0, -1, 6]}
            rotation={[0, 0, Math.PI / 3.7]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[-1, -1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[1, 1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={5}
            color="white"
            position={[-10, 0, 14]}
            rotation={[0, Math.PI / 2, Math.PI / 3]}
            scale={[100, 50, 1]}
          />
        </Environment>
      </Canvas>
    </div>
  );
}

interface BandProps {
  maxSpeed?: number;
  minSpeed?: number;
  isMobile?: boolean;
  ticketData: TicketViewData;
  qrToken?: string | null;
}

function Band({ maxSpeed = 50, minSpeed = 0, isMobile = false, ticketData, qrToken = null }: BandProps) {
  const cardColor = useMemo(() => {
    if (typeof document === 'undefined') return '#111111';
    const value = getComputedStyle(document.documentElement).getPropertyValue('--color-black').trim();
    return value || '#1b1b1b';
  }, []);

  const band = useRef<THREE.Mesh & { geometry: MeshLineGeometry }>(null);
  const cardGroup = useRef<THREE.Group>(null);

  // Created once: recreating it on `isMobile` would reset the simulation, and
  // the card would drop in again whenever the viewport crosses 768px (e.g. a
  // tablet rotating). Only the step budget follows the breakpoint.
  // Mobile keeps the lighter 1/30 step the Rapier version used; the solver
  // constants were fitted for both configurations.
  const stepFor = (mobile: boolean) => ({ fixedDt: mobile ? 1 / 30 : 1 / 60, substeps: mobile ? 5 : 8 });
  const [solver] = useState(() => new LanyardSolver({ iterations: 2, ...stepFor(isMobile) }));
  useEffect(() => {
    Object.assign(solver, stepFor(isMobile));
  }, [isMobile, solver]);

  const vec = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const dragTarget = useMemo(() => new THREE.Vector3(), []);

  const { nodes, materials } = useGLTF(CARD_MODEL_URL) as any;
  const texture = useTexture(LANYARD_TEXTURE_URL);
  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
  );
  const [dragged, drag] = useState<false | THREE.Vector3>(false);
  const [hovered, hover] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!qrToken) {
      setQrSvg(null);
      return;
    }
    const primary =
      typeof document !== 'undefined'
        ? getComputedStyle(document.documentElement)
            .getPropertyValue('--color-primary')
            .trim() || '#baec17'
        : '#baec17';
    QRCode.toString(qrToken, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      color: { dark: primary, light: '#00000000' },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => {
        document.body.style.cursor = 'auto';
      };
    }
  }, [hovered, dragged]);

  // Releasing the card must always clear the kinematic lock, even if the
  // pointerup lands outside the canvas.
  useEffect(() => {
    if (!dragged) {
      solver.setKinematicTarget(null);
      return;
    }
    const release = () => drag(false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [dragged, solver]);

  useFrame((state, delta) => {
    if (dragged && typeof dragged !== 'boolean') {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      dragTarget.set(vec.x - dragged.x, vec.y - dragged.y, vec.z - dragged.z);
      solver.setKinematicTarget(dragTarget);
    }

    // Guard against long frames (tab restore, slow first paint).
    solver.update(Math.min(delta, 0.1));
    solver.applyYawRestore(delta);
    solver.updateBandSmoothing(delta, minSpeed, maxSpeed);

    if (cardGroup.current) {
      cardGroup.current.position.copy(solver.cardPosition);
      cardGroup.current.quaternion.copy(solver.cardQuaternion);
    }

    if (band.current) {
      curve.points[0].copy(solver.beads[3]);
      curve.points[1].copy(solver.lerped[2]);
      curve.points[2].copy(solver.lerped[1]);
      curve.points[3].copy(solver.beads[0]);
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
    }
  });

  curve.curveType = 'chordal';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return (
    <>
      <group ref={cardGroup}>
        <group
          scale={2.25}
          position={[0, -1.2, -0.05]}
          onPointerOver={() => hover(true)}
          onPointerOut={() => hover(false)}
          onPointerUp={(e: any) => {
            e.target.releasePointerCapture?.(e.pointerId);
            drag(false);
          }}
          onPointerDown={(e: any) => {
            e.target.setPointerCapture?.(e.pointerId);
            drag(new THREE.Vector3().copy(e.point).sub(solver.cardPosition));
          }}
        >
          <mesh geometry={nodes.card.geometry}>
            <meshPhysicalMaterial
              color={cardColor}
              emissive={cardColor}
              emissiveIntensity={0.2}
              map={materials.base.map}
              clearcoat={0.3}
              clearcoatRoughness={0.15}
              roughness={0.23}
              metalness={0.7}
              envMapIntensity={0.6}
            />
          </mesh>
          <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={1} material-metalness={1} />
          <mesh geometry={nodes.clamp.geometry} material={materials.metal} material-roughness={1} material-metalness={1} />
          {/* Risoluzione 2x: div grande poi scalato in 3D così resta nei margini ma più nitido */}
          <group scale={[0.1, 0.1, 0.1]}>
            <Html
              position={[-0.15, 5.1, 0.08]}
              center
              transform
              pointerEvents="none"
              style={{
                width: '280px',
                padding: '24px 28px',
                background: 'transparent',
                color: 'var(--color-primary, #baec17)',
                lineHeight: 1.3
              }}
            >
              <div style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: '-4px', fontSize: '20px' }}>
                {ticketData.fullName} </div>
              <div style={{ opacity: 0.9, fontSize: '12px', marginBottom: '12px' }}>{ticketData.email}</div>

              <div style={{ fontWeight: 700, fontSize: '18px', marginBottom: '-4px' }}> {ticketData.eventName}</div>
              <div style={{ fontSize: '18px', fontWeight: 400, marginBottom: '12px' }}>{ticketData.eventDate}</div>

              <div style={{ fontSize: '16px', marginBottom: '12px' }}>{ticketData.entryName}</div>

              <div
                style={{ marginTop: '12px', width: '80px', height: '80px' }}
                aria-label="Ticket QR code"
              >
                {qrSvg ? (
                  <div
                    style={{ width: '100%', height: '100%' }}
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', opacity: 0.4 }} />
                )}
              </div>
            </Html>
          </group>
        </group>
      </group>
      <mesh ref={band as any}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={[1000, 2000]}
          useMap
          map={texture}
          repeat={[-4, 1]}
          lineWidth={1}
        />
      </mesh>
    </>
  );
}
