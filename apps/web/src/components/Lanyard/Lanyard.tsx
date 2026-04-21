/* eslint-disable react/no-unknown-property */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { useGLTF, useTexture, Environment, Lightformer, Html } from '@react-three/drei';
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
  RigidBodyProps
} from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import QRCode from 'qrcode';
import type { TicketViewData } from '@underclub/shared';

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
  gravity?: [number, number, number];
  fov?: number;
  transparent?: boolean;
  ticketData?: TicketViewData;
  qrToken?: string | null;
}

export default function Lanyard({
  position = [0, 0, 11],
  gravity = [0, -33, 0],
  fov = 24,
  transparent = true,
  ticketData = MOCK_TICKET,
  qrToken = null,
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
        <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
          <Band isMobile={isMobile} ticketData={ticketData} qrToken={qrToken} />
        </Physics>
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

  // Using "any" for refs since the exact types depend on Rapier's internals
  const band = useRef<any>(null);
  const fixed = useRef<any>(null);
  const j1 = useRef<any>(null);
  const j2 = useRef<any>(null);
  const j3 = useRef<any>(null);
  const card = useRef<any>(null);

  const vec = new THREE.Vector3();
  const ang = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const segmentProps: any = {
    type: 'dynamic' as RigidBodyProps['type'],
    canSleep: true,
    colliders: false,
    angularDamping: 4,
    linearDamping: 4
  };

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

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [
    [0, 0, 0],
    [0, 1.45, 0]
  ]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => {
        document.body.style.cursor = 'auto';
      };
    }
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (dragged && typeof dragged !== 'boolean') {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
      card.current?.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z
      });
    }
    if (fixed.current) {
      [j1, j2].forEach(ref => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
        const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
        ref.current.lerped.lerp(
          ref.current.translation(),
          delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
        );
      });
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }
  });

  curve.curveType = 'chordal';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return (
    <>
      <group position={[0, 3.92, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type={'fixed' as RigidBodyProps['type']} />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps} type={'dynamic' as RigidBodyProps['type']}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps} type={'dynamic' as RigidBodyProps['type']}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps} type={'dynamic' as RigidBodyProps['type']}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          position={[2, 7, 1]}
          ref={card}
          {...segmentProps}
          type={dragged ? ('kinematicPosition' as RigidBodyProps['type']) : ('dynamic' as RigidBodyProps['type'])}
        >
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={(e: any) => {
              e.target.releasePointerCapture(e.pointerId);
              drag(false);
            }}
            onPointerDown={(e: any) => {
              e.target.setPointerCapture(e.pointerId);
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())));
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
            <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={1} material-metalness={1}/>
            <mesh geometry={nodes.clamp.geometry} material={materials.metal} material-roughness={1} material-metalness={1}/>
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
                <div style={{ opacity: 0.9, fontSize: '12px', marginBottom: '12px'}}>{ticketData.email}</div>

                <div style={{ fontWeight: 700, fontSize: '18px', marginBottom: '-4px'}}> {ticketData.eventName}</div>
                <div style={{ fontSize: '18px', fontWeight: 400, marginBottom: '12px'}}>{ticketData.eventDate}</div>
                
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
        </RigidBody>
      </group>
      <mesh ref={band}>
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
