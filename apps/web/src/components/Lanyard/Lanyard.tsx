/* eslint-disable react/no-unknown-property */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import cardGLB from '/public/ticket/_Card.glb';
import lanyard from '/public/ticket/_lanyard.png';

extend({ MeshLineGeometry, MeshLineMaterial });

export type TicketData = {
  fullName: string;
  email: string;
  date: string;
  eventName: string;
  entry: string;
};

const MOCK_TICKET: TicketData = {
  fullName: 'Stevens Payano',
  email: 'stevensonpayano@icloud.com',
  date: 'MARCH 07',
  eventName: 'TECHNOROOM',
  entry: '10 € + 1 DRINK'
};

interface LanyardProps {
  position?: [number, number, number];
  gravity?: [number, number, number];
  fov?: number;
  transparent?: boolean;
  ticketData?: TicketData;
}

export default function Lanyard({
  position = [0, -1.85, 10.8],
  gravity = [0, -35, 0],
  fov = 24,
  transparent = true,
  ticketData = MOCK_TICKET
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
        onCreated={({ gl, camera }) => {
          gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1);
          camera.lookAt(0, position[1], 0);
        }}
      >
        <IdleHint basePosition={position} enabled />
        <ambientLight intensity={Math.PI} />
        <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
          <Band isMobile={isMobile} ticketData={ticketData} />
        </Physics>
        <Environment>
          <Lightformer
            intensity={3}
            color='white'
            position={[0, -1, 6]}
            rotation={[0, 0, Math.PI / 3.7]}
            scale={[100, 0.25, 1]}
          />
          <Lightformer
            intensity={1.7}
            color='white'
            position={[-1, -1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={1.5}
            color='white'
            position={[1, 1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={1.5}
            color='white'
            position={[-8, -15, 14]}
            rotation={[0, Math.PI / 2, Math.PI / 3]}
            scale={[100, 50, 1]}
          />
        </Environment>
      </Canvas>
    </div>
  );
}

function IdleHint({ basePosition, enabled }: { basePosition: [number, number, number]; enabled: boolean }) {
  const lastInteraction = useRef(Date.now());
  const idlePhase = useRef(0);

  const reset = useCallback(() => { lastInteraction.current = Date.now(); }, []);

  useEffect(() => {
    window.addEventListener('pointermove', reset);
    window.addEventListener('pointerdown', reset);
    window.addEventListener('touchstart', reset);
    return () => {
      window.removeEventListener('pointermove', reset);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('touchstart', reset);
    };
  }, [reset]);

  useFrame(({ camera }, delta) => {
    if (!enabled) {
      idlePhase.current = 0;
      return;
    }

    const sinceInteraction = Date.now() - lastInteraction.current;
    const amplitude = 2.5;

    if (sinceInteraction > 4000) {
      idlePhase.current += delta;
      const targetX = basePosition[0] + Math.sin(idlePhase.current * Math.PI) * amplitude;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.01);
    } else {
      idlePhase.current = 0;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, basePosition[0], 0.08);
    }
    camera.lookAt(0, basePosition[1], 0);
  });

  return null;
}

interface BandProps {
  maxSpeed?: number;
  minSpeed?: number;
  isMobile?: boolean;
  ticketData: TicketData;
}

function Band({ maxSpeed = 50, minSpeed = 0, ticketData }: BandProps) {
  const cardColor = useMemo(() => {
    if (typeof document === 'undefined') return '#111111';
    const value = getComputedStyle(document.documentElement).getPropertyValue('--color-deep-grey').trim();
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
  const strapExit = new THREE.Vector3();
  const cardQuat = new THREE.Quaternion();
  const clipOffset = new THREE.Vector3();
  const toFixed = new THREE.Vector3();
  const lateralTwist = new THREE.Vector3();

  const segmentProps: any = {
    type: 'dynamic' as RigidBodyProps['type'],
    canSleep: true,
    colliders: false,
    angularDamping: 4,
    linearDamping: 4
  };

  const { nodes, materials } = useGLTF(cardGLB) as any;
  const texture = useTexture(lanyard);
  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
  );
  const [dragged, drag] = useState<false | THREE.Vector3>(false);
  const [hovered, hover] = useState(false);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1.7]);
  useSphericalJoint(j3, card, [
    [0, 0, 0],
    [0, 1.7, 0]
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
      const cr = card.current.rotation();
      cardQuat.set(cr.x, cr.y, cr.z, cr.w);
      strapExit.set(0, 1.53, 0).applyQuaternion(cardQuat);

      const cardTrans = card.current.translation();
      clipOffset.set(0, 1.5, 0).applyQuaternion(cardQuat);
      const clipX = cardTrans.x + clipOffset.x;
      const clipY = cardTrans.y + clipOffset.y;
      const clipZ = cardTrans.z + clipOffset.z;

      const fixedPos = fixed.current.translation();

      toFixed.set(fixedPos.x - clipX, fixedPos.y - clipY, fixedPos.z - clipZ).normalize();
      lateralTwist.copy(strapExit).sub(toFixed);

      curve.points[0].set(clipX, clipY, clipZ);
      curve.points[1].set(
        clipX + strapExit.x * 0.7,
        clipY + strapExit.y * 0.7,
        clipZ + strapExit.z * 0.7
      );
      curve.points[2].copy(j2.current.lerped).addScaledVector(lateralTwist, 0.4);
      curve.points[3].copy(j1.current.lerped).addScaledVector(lateralTwist, 0.12);
      curve.points[4].set(fixedPos.x, fixedPos.y, fixedPos.z);
      band.current.geometry.setPoints(curve.getPoints(32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.45, z: ang.z });
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
          <CuboidCollider args={[0.8, 1.125, 0.005]} />
          <group
            scale={2.45}
            position={[0.005, -1.46, 0]}
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
                color= {cardColor}
                emissive={cardColor}
                emissiveIntensity={0} //0.2
                map={materials.base.map}
                clearcoat={1} //0.3
                clearcoatRoughness={0.75} //0.15
                roughness={0.7} //0.23
                metalness={0.25} //0.7
                envMapIntensity={0} //0.6
              />
            </mesh>
            <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={0.55} material-metalness={0.55}/>
            <mesh geometry={nodes.clamp.geometry} material={materials.metal} material-roughness={0.56} material-metalness={0.56}/>
            {/* Risoluzione 2x: div grande poi scalato in 3D così resta nei margini ma più nitido */}
            <group scale={[0.1, 0.1, 0.1]}>
              <Html
                position={[-0.27, 5, 0.08]}
                center
                transform
                pointerEvents="none"
                style={{
                  width: '280px',
                  padding: '24px 28px',
                  background: 'transparent',
                  lineHeight: 1.3,
                  color: 'var(--color-primary)'
                }}
              >
                <div style={{ fontWeight: 700, textTransform: 'uppercase', marginBottom: '-4px', fontSize: '20px' }}>
                  {ticketData.fullName} </div>
                <div style={{ opacity: 0.9, fontSize: '12px', marginBottom: '12px'}}>{ticketData.email}</div>

                <div style={{ fontWeight: 700, fontSize: '18px', marginBottom: '-4px'}}> {ticketData.eventName}</div>
                <div style={{ fontSize: '18px', fontWeight: 400, marginBottom: '12px'}}>{ticketData.date}</div>
                
                <div style={{ fontSize: '12px', marginBottom: '20px' }}>{ticketData.entry}</div>



                <div style={{ width: '120px', height: '120px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 253.15 253.15" style={{ width: '100%', height: '100%', fill: 'var(--color-primary' }}>
                    <path d="M0 0h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 8.73h8.73v8.73H0zm52.38 0h8.73v8.73h-8.73zm43.64 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm52.37 0h8.73v8.73h-8.73zM0 17.46h8.73v8.73H0zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.18 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm52.38 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zM0 26.19h8.73v8.73H0zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zM0 34.92h8.73v8.73H0zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm52.38 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zM0 43.65h8.73v8.73H0zm52.38 0h8.73v8.73h-8.73zm26.18 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm43.65 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm52.37 0h8.73v8.73h-8.73zM0 52.38h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM69.83 61.11h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 69.83h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.18 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm43.65 0h8.73v8.73h-8.73zm52.37 0h8.73v8.73h-8.73zM17.46 78.56h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm43.65 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM8.73 87.29h8.73v8.73H8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm26.18 0h8.73v8.73h-8.73zm-209.5 8.73h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm113.48 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm-192.04 8.73h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm52.37 0h8.73v8.73h-8.73zM8.73 113.48h8.73v8.73H8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm43.65 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 122.21h8.73v8.73H0zm26.19 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm52.38 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm-226.96 8.73h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm69.83 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm-226.96 8.73h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zM0 148.4h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm17.46 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.18 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 157.13h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm26.19 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zM0 165.86h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 174.59h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm34.92 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm-165.86 8.73h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 192.05h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 200.78h8.73v8.73H0zm52.38 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zM0 209.5h8.73v8.73H0zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zM0 218.23h8.73v8.73H0zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm61.1 0h8.73v8.73h-8.73zM0 226.96h8.73v8.73H0zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm26.18 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zM0 235.69h8.73v8.73H0zm52.38 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.92 0h8.73v8.73h-8.73zm8.72 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.46 0h8.73v8.73h-8.73zM0 244.42h8.73v8.73H0zm8.73 0h8.73v8.73H8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm17.45 0h8.73v8.73h-8.73zm52.38 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm26.19 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73zm34.91 0h8.73v8.73h-8.73zm8.73 0h8.73v8.73h-8.73z" />
                  </svg>
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
