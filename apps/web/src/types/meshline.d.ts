import type { ThreeElements } from "@react-three/fiber";

declare module "@react-three/fiber" {
  interface ThreeElements {
    meshLineGeometry: object;
    meshLineMaterial: object;
  }
}
