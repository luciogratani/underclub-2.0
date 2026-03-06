/// <reference types="vite/client" />

declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

declare module "*.glb" {
  const src: string;
  export default src;
}
