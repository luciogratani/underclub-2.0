// A module (not a global script), so the block below augments the package.
export {};

declare module "@react-three/fiber" {
  interface ThreeElements {
    meshLineGeometry: object;
    meshLineMaterial: object;
  }
}
