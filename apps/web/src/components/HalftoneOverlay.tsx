import { useEffect, useRef } from "react";
import vertSrc from "../shaders/halftone.vert.glsl?raw";
import fragSrc from "../shaders/halftone.frag.glsl?raw";
import { parseColor } from "../utils/parseColor";

export type HalftoneGrid = "square" | "hex";

export interface HalftoneOverlayProps {
  colorBack?: string;
  colorFront?: string;
  size?: number;
  radius?: number;
  grid?: HalftoneGrid;
  opacity?: number;
  width?: number;
  height?: number;
  speed?: number;
  grainMixer?: number;
  grainSize?: number;
  /** Angolo griglia in gradi (0 = orizzontale; es. 15–45 stile stampa) */
  angle?: number;
  /** Scala del noise di luminanza (quanto grosse le macchie; es. 3–8) */
  luminanceScale?: number;
  /** Morbidezza bordo punti (0 = netto, 1 = molto soft, stile stampa) */
  softness?: number;
  /** Min della curva di oscillazione luminance noise (valore uniform in shader) */
  luminanceNoiseMin?: number;
  /** Max della curva di oscillazione luminance noise */
  luminanceNoiseMax?: number;
  /** Moltiplicatore velocità oscillazione (1 = ciclo ~3s, 2 = più veloce, 0.5 = più lento) */
  luminanceNoiseSpeed?: number;
  /** Min oscillazione grain size (più fine); usato se grainSizeSpeed > 0 */
  grainSizeMin?: number;
  /** Max oscillazione grain size (più grosso) */
  grainSizeMax?: number;
  /** Velocità oscillazione grain (0 = grain size statico da prop grainSize) */
  grainSizeSpeed?: number;
  /** Velocità drift luminanza: sposta le zone chiaro/scuro senza scalare (0 = fermo) */
  luminanceDriftSpeed?: number;
}

const defaultProps: Required<HalftoneOverlayProps> = {
  colorBack: "rgba(0,0,0,0)",
  colorFront: "#000000",
  size: 0.3,
  radius: 0.6,
  grid: "square",
  opacity: 0.15,
  width: typeof window !== "undefined" ? window.innerWidth : 800,
  height: typeof window !== "undefined" ? window.innerHeight : 600,
  speed: 0,
  grainMixer: 0.2,
  grainSize: 1,
  angle: 0,
  luminanceScale: 5,
  softness: 0.3,
  luminanceNoiseMin: 0.6,
  luminanceNoiseMax: 1.4,
  luminanceNoiseSpeed: 1,
  grainSizeMin: 0.2,
  grainSizeMax: 1.2,
  grainSizeSpeed: 0,
  luminanceDriftSpeed: 0,
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertSource: string,
  fragSource: string
): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

export default function HalftoneOverlay(props: HalftoneOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    colorBack,
    colorFront,
    size,
    radius,
    grid,
    opacity,
    width: propWidth,
    height: propHeight,
    speed,
    grainMixer,
    grainSize,
    angle,
    luminanceScale,
    softness,
    luminanceNoiseMin,
    luminanceNoiseMax,
    luminanceNoiseSpeed,
    grainSizeMin,
    grainSizeMax,
    grainSizeSpeed,
    luminanceDriftSpeed,
  } = { ...defaultProps, ...props };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true });
    if (!gl) return;

    const program = createProgram(gl, vertSrc, fragSrc);
    if (!program) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Fullscreen quad: two triangles
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, "a_position");

    const setSize = (w: number, h: number) => {
      const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      const cw = Math.floor(w * dpr);
      const ch = Math.floor(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    };

    const useContainerSize = propWidth == null && propHeight == null;
    const w = propWidth ?? (typeof window !== "undefined" ? window.innerWidth : 800);
    const h = propHeight ?? (typeof window !== "undefined" ? window.innerHeight : 600);
    setSize(w, h);

    const resizeObserver =
      useContainerSize &&
      typeof ResizeObserver !== "undefined" &&
      new ResizeObserver(() => {
        if (canvas.parentElement) {
          const rect = canvas.parentElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) setSize(rect.width, rect.height);
        }
      });
    if (resizeObserver && canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    const onResize = () => {
      if (useContainerSize && canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) setSize(rect.width, rect.height);
      } else {
        setSize(propWidth ?? window.innerWidth, propHeight ?? window.innerHeight);
      }
    };
    window.addEventListener("resize", onResize);

    // Cells per side: densità (size 0→1 → circa 7→300)
    const cells = 7 + size * 293;
    const back = parseColor(colorBack);
    const front = parseColor(colorFront);
    const gridVal = grid === "hex" ? 1 : 0;

    let rafId = 0;
    let startTime = 0;

    // Luminance noise: oscilla tra min e max, curva rumorosa (sin + armoniche)
    const center = (luminanceNoiseMin + luminanceNoiseMax) / 2;
    const halfRange = (luminanceNoiseMax - luminanceNoiseMin) / 2;
    const getLuminanceNoise = (timeMs: number) => {
      const t = (timeMs / 1000) * 2 * luminanceNoiseSpeed;
      const base = center + halfRange * Math.sin(t);
      const wobble =
        halfRange * 0.2 * Math.sin(t * 2.7) +
        halfRange * 0.12 * Math.sin(t * 5.1) +
        halfRange * 0.1 * Math.sin(t * 7.3);
      return Math.max(
        luminanceNoiseMin,
        Math.min(luminanceNoiseMax, base + wobble)
      );
    };

    // Grain size: oscilla tra min e max (effetto "muovere" la texture)
    const grainCenter = (grainSizeMin + grainSizeMax) / 2;
    const grainHalfRange = (grainSizeMax - grainSizeMin) / 2;
    const getGrainSize = (timeMs: number) => {
      if (grainSizeSpeed <= 0) return grainSize;
      const t = (timeMs / 1000) * 2 * grainSizeSpeed;
      const base = grainCenter + grainHalfRange * Math.sin(t);
      const wobble =
        grainHalfRange * 0.2 * Math.sin(t * 2.7) +
        grainHalfRange * 0.12 * Math.sin(t * 5.1);
      return Math.max(
        grainSizeMin,
        Math.min(grainSizeMax, base + wobble)
      );
    };

    const draw = (time?: number) => {
      const tw = canvas.width;
      const th = canvas.height;
      const timeMs = time ?? 0;
      const timeSec = timeMs / 1000;
      const luminanceNoise = getLuminanceNoise(timeMs);
      const grainSizeCurrent = getGrainSize(timeMs);
      const drift =
        luminanceDriftSpeed > 0
          ? [
              timeSec * luminanceDriftSpeed * 0.5,
              timeSec * luminanceDriftSpeed * 0.35,
            ]
          : [0, 0];

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), tw, th);
      gl.uniform1f(gl.getUniformLocation(program, "u_time"), timeMs / 1000);
      gl.uniform4fv(gl.getUniformLocation(program, "u_color_back"), back);
      gl.uniform4fv(gl.getUniformLocation(program, "u_color_front"), front);
      gl.uniform1f(gl.getUniformLocation(program, "u_cells"), cells);
      gl.uniform1f(gl.getUniformLocation(program, "u_radius"), radius);
      gl.uniform1f(gl.getUniformLocation(program, "u_grid"), gridVal);
      gl.uniform1f(gl.getUniformLocation(program, "u_opacity"), opacity);
      gl.uniform1f(gl.getUniformLocation(program, "u_grain_mixer"), grainMixer);
      gl.uniform1f(gl.getUniformLocation(program, "u_grain_size"), grainSizeCurrent);
      gl.uniform1f(gl.getUniformLocation(program, "u_speed"), speed);
      gl.uniform1f(gl.getUniformLocation(program, "u_angle"), (angle * Math.PI) / 180);
      gl.uniform1f(gl.getUniformLocation(program, "u_luminance_noise"), luminanceNoise);
      gl.uniform1f(gl.getUniformLocation(program, "u_luminance_scale"), luminanceScale);
      gl.uniform2f(
        gl.getUniformLocation(program, "u_luminance_drift"),
        drift[0],
        drift[1]
      );
      gl.uniform1f(gl.getUniformLocation(program, "u_softness"), softness);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const tick = (time: number) => {
      if (startTime === 0) startTime = time;
      draw(time - startTime);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      if (resizeObserver && canvas.parentElement) resizeObserver.unobserve(canvas.parentElement);
      gl.deleteProgram(program);
      gl.deleteBuffer(buf);
    };
  }, [
    colorBack,
    colorFront,
    size,
    radius,
    grid,
    opacity,
    propWidth,
    propHeight,
    speed,
    grainMixer,
    grainSize,
    angle,
    luminanceScale,
    softness,
    luminanceNoiseMin,
    luminanceNoiseMax,
    luminanceNoiseSpeed,
    grainSizeMin,
    grainSizeMax,
    grainSizeSpeed,
    luminanceDriftSpeed,
  ]);

    return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 9997 }}
      width={propWidth}
      height={propHeight}
      aria-hidden
    />
  );
}
