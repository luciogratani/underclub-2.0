precision highp float;

varying vec2 v_uv;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_color_back;
uniform vec4 u_color_front;
uniform float u_cells;
uniform float u_radius;
uniform float u_grid;
uniform float u_opacity;
uniform float u_grain_mixer;
uniform float u_grain_size;
uniform float u_speed;
uniform float u_angle;
uniform float u_luminance_noise;
uniform float u_luminance_scale;
uniform vec2 u_luminance_drift;
uniform float u_softness;

// Hash senza texture: procedurale
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// Noise 2D smooth (bilinear) per "luminanza" procedurale
float noise2D(vec2 p) {
  vec2 id = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(id);
  float b = hash(id + vec2(1.0, 0.0));
  float c = hash(id + vec2(0.0, 1.0));
  float d = hash(id + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  // Rotazione griglia (come halftone da stampa: angolo tipico riduce moiré)
  vec2 centerUV = v_uv - 0.5;
  float c = cos(u_angle);
  float s = sin(u_angle);
  vec2 rotated = vec2(centerUV.x * c - centerUV.y * s, centerUV.x * s + centerUV.y * c) + 0.5;

  // UV in spazio "cella"
  vec2 uv = rotated * u_cells;
  vec2 cellId = floor(uv);
  vec2 local = fract(uv);

  // Griglia esagonale: offset righe dispari
  if (u_grid > 0.5) {
    local.x += mod(cellId.y, 2.0) * 0.5;
    local.x = fract(local.x);
  }

  vec2 cellCenter = vec2(0.5);
  float dist = length(local - cellCenter);

  // Raggio base in spazio cella
  float baseRadius = 0.5 * u_radius;
  float radius = baseRadius;

  // "Luminanza" procedurale (come Paper: zone chiare = punti grandi, scure = piccoli)
  // u_luminance_drift sposta le zone senza scalare (drift invece di zoom)
  if (u_luminance_noise > 0.001) {
    float lum = noise2D(rotated * u_luminance_scale + u_luminance_drift);
    radius *= (1.0 - u_luminance_noise + u_luminance_noise * (0.35 + 0.65 * lum));
  }

  // Grain per-cell (variazione fine)
  if (u_grain_mixer > 0.001) {
    vec3 seed = vec3(cellId.x * u_grain_size, cellId.y * u_grain_size, u_time * u_speed);
    float n = hash3(seed);
    radius *= (1.0 - u_grain_mixer + u_grain_mixer * (0.7 + 0.3 * n));
  }

  // Cerchio con anti-aliasing; softness = bordo più morbido (stile stampa)
  float edge = 0.02 + 0.06 * u_softness;
  float circle = 1.0 - smoothstep(radius - edge, radius + edge, dist);

  vec4 color = mix(u_color_back, u_color_front, circle);
  color.a *= u_opacity;
  color.rgb *= color.a;

  gl_FragColor = color;
}
