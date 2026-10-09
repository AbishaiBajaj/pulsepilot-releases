// PulsePilot download page - 3D "journey" background.
// A glowing particle landscape you fly through; scrolling moves the camera
// forward and shifts the colours chapter by chapter. Floating orbs are the
// "posts" travelling out into the world.
import * as THREE from './vendor/three.module.min.js'

const canvas = document.getElementById('scene')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const small = Math.min(window.innerWidth, window.innerHeight) < 700

// Colour palettes per chapter: [valley, hills, peaks]
const PALETTES = [
  ['#5b21b6', '#c026d3', '#f5d0fe'], // hero
  ['#6d28d9', '#ec4899', '#fde68a'], // 01 create
  ['#3730a3', '#38bdf8', '#e0f2fe'], // 02 schedule
  ['#0f766e', '#22d3ee', '#ccfbf1'], // 03 listen
  ['#a21caf', '#f59e0b', '#fff7ed'] //  04 grow
].map((p) => p.map((c) => new THREE.Color(c)))

let renderer
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' })
} catch {
  document.documentElement.classList.add('no-webgl')
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260)

  // ---------------------------------------------------------------------------
  // Terrain of glowing points (a valley the camera travels through)
  // ---------------------------------------------------------------------------
  const COLS = small ? 130 : 220
  const ROWS = small ? 95 : 160
  const WIDTH = 90
  const DEPTH = 130
  const positions = new Float32Array(COLS * ROWS * 3)
  const seeds = new Float32Array(COLS * ROWS)
  let i = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      positions[i * 3] = (c / (COLS - 1) - 0.5) * WIDTH + (Math.random() - 0.5) * 0.25
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = -(r / (ROWS - 1)) * DEPTH
      seeds[i] = Math.random()
      i++
    }
  }
  const terrainGeo = new THREE.BufferGeometry()
  terrainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  terrainGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))

  const NOISE = /* glsl */ `
    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
    float snoise(vec2 v){
      const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
      vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
      vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
      vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
      vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
      vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
      m=m*m; m=m*m;
      vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
      m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
      vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
      return 130.0*dot(m,g);
    }`

  const uniforms = {
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uDepth: { value: DEPTH },
    uSize: { value: small ? 3.0 : 2.6 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uColorA: { value: PALETTES[0][0].clone() },
    uColorB: { value: PALETTES[0][1].clone() },
    uColorC: { value: PALETTES[0][2].clone() }
  }

  // Shared by the glowing dots and the ridge lines so both follow the same hills.
  const TERRAIN_VERTEX = /* glsl */ `
    uniform float uTime, uTravel, uDepth, uSize, uPixelRatio;
    uniform vec2 uMouse;
    attribute float seed;
    varying float vHeight;
    varying float vDepth;
    varying float vSeed;
    ${NOISE}
    void main() {
      vec3 p = position;
      // Scroll the endless landscape towards the camera.
      p.z = mod(p.z + uTravel, uDepth) - uDepth + 8.0;
      float worldZ = p.z - uTravel;
      // A valley: gentle path in the middle, rolling mountains to the sides.
      float side = smoothstep(3.0, 28.0, abs(p.x));
      float h = snoise(vec2(p.x * 0.045, worldZ * 0.045)) * (0.9 + side * 3.6);
      h += snoise(vec2(p.x * 0.12 + 7.0, worldZ * 0.12)) * 0.5;
      h += sin(p.x * 0.18 + uTime * 0.7 + worldZ * 0.05) * 0.2;
      h += side * 3.2;
      // Ripple that follows the mouse.
      float md = length(vec2(p.x - uMouse.x * 18.0, p.z + 18.0));
      h += sin(md * 0.9 - uTime * 2.4) * 0.28 * exp(-md * 0.08);
      p.y = h - 1.2;
      vHeight = h;
      vSeed = seed;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vDepth = -mv.z;
      float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + seed * 40.0);
      gl_PointSize = uSize * uPixelRatio * twinkle * (1.0 + max(h, 0.0) * 0.12) * (26.0 / max(vDepth, 0.5));
      gl_Position = projectionMatrix * mv;
    }`
  const TERRAIN_COLOR = /* glsl */ `
    uniform vec3 uColorA, uColorB, uColorC;
    varying float vHeight;
    varying float vDepth;
    varying float vSeed;
    vec3 terrainColor() {
      vec3 col = mix(uColorA, uColorB, clamp(vHeight * 0.2 + 0.45, 0.0, 1.0));
      return mix(col, uColorC, smoothstep(3.6, 6.0, vHeight) * 0.85);
    }
    float terrainFade() {
      return (1.0 - smoothstep(28.0, 112.0, vDepth)) * smoothstep(0.6, 4.0, vDepth);
    }`

  const terrain = new THREE.Points(
    terrainGeo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: TERRAIN_VERTEX,
      fragmentShader: /* glsl */ `
        ${TERRAIN_COLOR}
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(terrainColor() * 1.15, soft * terrainFade() * (0.7 + vSeed * 0.3));
        }`
    })
  )
  scene.add(terrain)

  // Ridge lines along every other row: gives the landscape a flowing, contoured look.
  const lineIndex = []
  for (let r = 0; r < ROWS; r += 2) {
    for (let c = 0; c < COLS - 1; c++) lineIndex.push(r * COLS + c, r * COLS + c + 1)
  }
  const ridgeGeo = new THREE.BufferGeometry()
  ridgeGeo.setAttribute('position', terrainGeo.getAttribute('position'))
  ridgeGeo.setAttribute('seed', terrainGeo.getAttribute('seed'))
  ridgeGeo.setIndex(lineIndex)
  const ridges = new THREE.LineSegments(
    ridgeGeo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: TERRAIN_VERTEX,
      fragmentShader: /* glsl */ `
        ${TERRAIN_COLOR}
        void main() {
          gl_FragColor = vec4(terrainColor(), 0.22 * terrainFade());
        }`
    })
  )
  scene.add(ridges)

  // ---------------------------------------------------------------------------
  // Glow on the horizon and a sky full of faint stars
  // ---------------------------------------------------------------------------
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 90),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorB, uColorC;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 q = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 2.6);
          float g = exp(-dot(q, q) * 9.0);
          float core = exp(-dot(q, q) * 60.0);
          vec3 col = mix(uColorB, uColorC, core);
          gl_FragColor = vec4(col, (g * 0.42 + core * 0.25) * (0.92 + 0.08 * sin(uTime * 0.6)));
        }`
    })
  )
  glow.position.set(0, 6, -120)
  glow.renderOrder = -1
  scene.add(glow)

  const STARS = small ? 260 : 520
  const starPos = new Float32Array(STARS * 3)
  const starSeed = new Float32Array(STARS)
  for (let k = 0; k < STARS; k++) {
    starPos[k * 3] = (Math.random() - 0.5) * 340
    starPos[k * 3 + 1] = 8 + Math.random() * 110
    starPos[k * 3 + 2] = -130 - Math.random() * 40
    starSeed[k] = Math.random()
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  starGeo.setAttribute('seed', new THREE.BufferAttribute(starSeed, 1))
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uPixelRatio;
        attribute float seed;
        varying float vAlpha;
        void main() {
          vAlpha = (0.25 + seed * 0.6) * (0.6 + 0.4 * sin(uTime * (0.6 + seed) + seed * 50.0));
          gl_PointSize = (1.2 + seed * 2.2) * uPixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorC;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(mix(vec3(1.0), uColorC, 0.4), smoothstep(0.5, 0.1, d) * vAlpha);
        }`
    })
  )
  scene.add(stars)

  // ---------------------------------------------------------------------------
  // Floating orbs ("posts" travelling out into the world)
  // ---------------------------------------------------------------------------
  const ORBS = small ? 70 : 140
  const orbPos = new Float32Array(ORBS * 3)
  const orbSeed = new Float32Array(ORBS)
  for (let k = 0; k < ORBS; k++) {
    orbPos[k * 3] = (Math.random() - 0.5) * 60
    orbPos[k * 3 + 1] = Math.random() * 14 + 1
    orbPos[k * 3 + 2] = -Math.random() * DEPTH
    orbSeed[k] = Math.random()
  }
  const orbGeo = new THREE.BufferGeometry()
  orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPos, 3))
  orbGeo.setAttribute('seed', new THREE.BufferAttribute(orbSeed, 1))
  const orbs = new THREE.Points(
    orbGeo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uTravel, uDepth, uPixelRatio;
        attribute float seed;
        varying float vSeed;
        varying float vDepth;
        void main() {
          vec3 p = position;
          p.z = mod(p.z + uTravel * 1.15, uDepth) - uDepth + 8.0;
          p.y += sin(uTime * (0.4 + seed * 0.6) + seed * 20.0) * 0.8;
          p.x += cos(uTime * 0.3 + seed * 10.0) * 0.6;
          vSeed = seed;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          gl_PointSize = (6.0 + seed * 10.0) * uPixelRatio * (20.0 / max(vDepth, 0.5));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorB, uColorC;
        uniform float uTime;
        varying float vSeed;
        varying float vDepth;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = smoothstep(0.18, 0.0, d);
          float halo = smoothstep(0.5, 0.05, d) * 0.45;
          vec3 col = mix(uColorB, uColorC, vSeed);
          float pulse = 0.7 + 0.3 * sin(uTime * 3.0 + vSeed * 30.0);
          float fog = 1.0 - smoothstep(25.0, 110.0, vDepth);
          gl_FragColor = vec4(col, (core + halo) * pulse * fog);
        }`
    })
  )
  scene.add(orbs)

  // ---------------------------------------------------------------------------
  // Interaction: scroll = journey, mouse = parallax
  // ---------------------------------------------------------------------------
  const mouse = new THREE.Vector2(0, 0)
  const mouseTarget = new THREE.Vector2(0, 0)
  window.addEventListener(
    'pointermove',
    (e) => {
      mouseTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    },
    { passive: true }
  )

  function scrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
  }

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w < h ? 72 : 60
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  const tmpA = new THREE.Color()
  const tmpB = new THREE.Color()
  // Which palette to show: each chapter section keeps its own colours and blends
  // into the next one as it scrolls away.
  const CHAPTERS = ['top', 'create', 'schedule', 'listen', 'grow', 'download']
  const CHAPTER_PALETTE = [0, 1, 2, 3, 4, 4]
  function chapterPosition(p) {
    const els = CHAPTERS.map((id) => document.getElementById(id))
    if (els.some((el) => !el)) return p * (PALETTES.length - 1)
    const mid = window.scrollY + window.innerHeight * 0.5
    for (let k = els.length - 1; k >= 0; k--) {
      if (k > 0 && mid < els[k].offsetTop) continue
      if (k === els.length - 1) return CHAPTER_PALETTE[k]
      const top = els[k].offsetTop
      const f = Math.min(1, Math.max(0, (mid - top) / Math.max(1, els[k + 1].offsetTop - top)))
      const e = Math.min(1, Math.max(0, (f - 0.55) / 0.45))
      return CHAPTER_PALETTE[k] + (CHAPTER_PALETTE[k + 1] - CHAPTER_PALETTE[k]) * e * e * (3 - 2 * e)
    }
    return 0
  }

  function paletteAt(x, slot) {
    const i0 = Math.floor(x)
    const i1 = Math.min(PALETTES.length - 1, i0 + 1)
    const e = x - i0
    return tmpA.copy(PALETTES[i0][slot]).lerp(tmpB.copy(PALETTES[i1][slot]), e)
  }

  let last = performance.now()
  let t = 0
  let travel = 0
  let journey = 0
  let running = true

  function frame() {
    if (!running) return
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    t += dt
    const p = scrollProgress()

    // Constant cruise + scroll-driven journey distance (smoothed).
    journey += ((reduceMotion ? 0 : p * 260) - journey) * Math.min(1, dt * 3)
    travel += dt * (reduceMotion ? 0.3 : 2.4)
    uniforms.uTime.value = reduceMotion ? t * 0.2 : t
    uniforms.uTravel.value = travel + journey

    mouse.lerp(mouseTarget, Math.min(1, dt * 2.5))
    uniforms.uMouse.value.copy(mouse)

    const chapter = chapterPosition(p)
    for (let s = 0; s < 3; s++) {
      const u = s === 0 ? uniforms.uColorA : s === 1 ? uniforms.uColorB : uniforms.uColorC
      u.value.lerp(paletteAt(chapter, s), Math.min(1, dt * 2))
    }

    // Camera glides along the valley; dips lower as the journey goes on.
    const bob = reduceMotion ? 0 : Math.sin(t * 0.35) * 0.25
    camera.position.set(mouse.x * 1.6, 3.4 - p * 1.2 + mouse.y * 0.5 + bob, 6)
    camera.lookAt(mouse.x * 0.8, 1.4 - p * 0.6, -24)
    camera.rotation.z += mouse.x * -0.03

    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible'
    if (visible && !running) {
      running = true
      last = performance.now()
      requestAnimationFrame(frame)
    } else if (!visible) {
      running = false
    }
  })

  document.documentElement.classList.add('webgl-ready')
  requestAnimationFrame(frame)
}
