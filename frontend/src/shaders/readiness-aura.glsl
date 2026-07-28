// readiness-aura.glsl — the flagship "Morning Readiness Moment" backdrop.
//
// The state colour as LIGHT EMITTED from behind the readiness ring into a
// near-black room — not a tint laid over the page. The warm, joyful bloom
// intent is a deliberate product call and is kept (it departs from the pen's
// dim sonar aura on purpose); what changed in Jul 2026 is CONTAINMENT.
//
// The previous version bloomed at radius 1.02 in a space ~1 unit tall, lifted
// its highlight 60% toward white, and floored its bottom falloff at 0.58 — so
// it never reached u_bg anywhere. Combined with the canvas spanning main's full
// ~2500px scroll height (now viewport-fixed, see DashboardShell), every card on
// the page sat inside a pale pastel wash, and text over it failed contrast on
// the light faces.
//
// One state-keyed u_aura still tints the screen: #16E08A ready · #FFB020
// controlled · #FF9E3D rest · #FF5A3C post-ride · #3E9BFF planned-rest.
//
// SYNC NOTE: the app compiles shaders from inline strings, so the RUNTIME copy
// lives in ShaderCanvas.tsx as the `aura` variant. This file is generated from
// that copy and is design provenance only — regenerate it after any change
// rather than editing it by hand. (The two had already drifted once.)

/** @resolution */
uniform vec2 u_resolution;
/** @time */
uniform float u_time;
/** @label Base @color @default #0A0C0F */
uniform vec3 u_bg;
/** @label Aura @color @default #16E08A */
uniform vec3 u_aura;

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv=gl_FragCoord.xy/u_resolution;
  uv.y=1.0-uv.y;
  float aspect=u_resolution.x/u_resolution.y;
  // 0.42 puts the emission centre just above the readiness ring's own centre
  // (the 224px ring sits at ~0.50 of an 844px viewport). Verified by rendering
  // the shader standalone with the ring's real geometry overlaid: at 0.34 the
  // ring is lit from above and goes dark across its lower arc; at 0.50 the
  // glow reaches too far down and re-brightens the cards below the verdict.
  // The canvas is viewport-fixed, so this stays true as content scrolls past.
  vec2 p=(uv-vec2(0.5,0.42))*vec2(aspect,1.0);
  float r=length(p);

  // Companion tones. The highlight is only lightly lifted toward a warm white:
  // the old 0.60 mix bleached the state colour into pastel and was the main
  // source of the wash. The shoulder now sits mostly in u_bg so the falloff
  // lands on true dark instead of on a tinted floor.
  vec3 light=mix(u_aura,vec3(1.0,0.96,0.90),0.20);
  vec3 deep =mix(u_aura,u_bg,0.80);

  // Living light: the same domain-warped flow + slow breath, a touch quieter.
  float t=u_time*0.045;
  vec2 q=vec2(fbm(p*1.9+t),fbm(p*1.9+vec2(2.7,1.9)-t));
  float flow=fbm(p*1.9+1.3*q);
  float breath=0.5+0.5*sin(u_time*0.55);

  // Contained emission: a tight core, a wide soft halo, and one offset lobe
  // low-right so the field has mesh-gradient depth rather than one flat radial.
  float core=pow(smoothstep(0.44,0.0,r),2.5);
  float halo=pow(smoothstep(0.85,0.05,r),3.6)*0.26;
  vec2 p2=(uv-vec2(0.82,0.08))*vec2(aspect,1.0);
  float lobe=pow(smoothstep(0.55,0.0,length(p2)),2.8)*0.14;
  // ENERGY 0.86 overall: at 1.0 the field still read as coloured wallpaper
  // rather than as a light source with darkness around it.
  float energy=clamp((core*(0.70+0.16*breath)+halo+lobe)*(0.86+0.26*flow),0.0,1.0)*0.86;

  vec3 col=u_bg;
  col=mix(col,deep,energy);
  col=mix(col,u_aura,clamp(core*(0.52+0.12*breath)+core*flow*0.12,0.0,1.0)*0.86);
  col=mix(col,light,clamp(pow(core,2.3)*0.52,0.0,1.0)*0.86);

  // Vignette — pulls the corners down so the emission reads as a light source
  // in a room rather than a full-bleed gradient.
  vec2 vp=(uv-0.5)*vec2(aspect,1.0);
  col*=1.0-0.46*pow(clamp(length(vp)/1.05,0.0,1.0),1.7);

  // Film grain. Slightly stronger than the old pure-dither so the large flat
  // dark areas have tactility instead of reading as empty #0A0C0F.
  col+=(hash(gl_FragCoord.xy+u_time)-0.5)*0.024;
  gl_FragColor=vec4(col,1.0);
}
