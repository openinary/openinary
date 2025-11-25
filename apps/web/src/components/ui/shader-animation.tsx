"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export function ShaderAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    camera: THREE.Camera
    scene: THREE.Scene
    renderer: THREE.WebGLRenderer
    uniforms: any
    animationId: number
  } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current

    // Vertex shader
    const vertexShader = `
      void main() {
        gl_Position = vec4( position, 1.0 );
      }
    `

    // Fragment shader
    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      // Fonction pour créer un dégradé radial de couleurs de lever de soleil
      // t = distance normalisée depuis le centre (0 = centre, 1 = bord)
      vec3 sunriseGradient(float t) {
        // Normaliser t entre 0 et 1
        t = clamp(t, 0.0, 1.0);
        
        // Couleurs du lever de soleil (du centre vers l'extérieur)
        vec3 yellow = vec3(1.0, 0.95, 0.7);        // Jaune vif au centre (soleil)
        vec3 orange = vec3(1.0, 0.6, 0.3);         // Orange
        vec3 pink = vec3(0.9, 0.5, 0.6);           // Rose
        vec3 purple = vec3(0.4, 0.3, 0.5);         // Violet
        vec3 darkBlue = vec3(0.15, 0.2, 0.35);     // Bleu nuit
        vec3 lightBlue = vec3(0.7, 0.85, 1.0);     // Bleu ciel clair à l'extérieur
        
        // Créer le dégradé radial avec plusieurs stops
        vec3 color;
        if (t < 0.15) {
          // Centre : jaune vif (soleil)
          color = mix(yellow, orange, t / 0.15);
        } else if (t < 0.3) {
          // Orange vers rose
          color = mix(orange, pink, (t - 0.15) / 0.15);
        } else if (t < 0.5) {
          // Rose vers violet
          color = mix(pink, purple, (t - 0.3) / 0.2);
        } else if (t < 0.7) {
          // Violet vers bleu nuit
          color = mix(purple, darkBlue, (t - 0.5) / 0.2);
        } else {
          // Bleu nuit vers bleu ciel clair
          color = mix(darkBlue, lightBlue, (t - 0.7) / 0.3);
        }
        
        return color;
      }

      // Fonction de bruit simple pour ajouter de la texture
      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      // Fonction de bruit lissé
      float smoothNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float a = noise(i);
        float b = noise(i + vec2(1.0, 0.0));
        float c = noise(i + vec2(0.0, 1.0));
        float d = noise(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      
      void main(void) {
        // Coordonnées UV normalisées (0,0 = bas gauche, 1,1 = haut droite)
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        
        // Origine du cercle radial : centre horizontal du bas de l'écran
        vec2 origin = vec2(0.5, 0.0);
        
        // Calculer la distance depuis l'origine
        float distFromOrigin = distance(uv, origin);
        
        // Normaliser la distance par rapport à la diagonale de l'écran
        // Pour que le cercle puisse couvrir tout l'écran
        float aspectRatio = resolution.x / resolution.y;
        float maxDist = sqrt(1.0 + aspectRatio * aspectRatio);
        float normalizedDist = distFromOrigin / maxDist;
        
        // Animation de progression du cercle (0 = petit cercle, 1 = cercle rempli)
        // Le cercle grandit progressivement en 6.5 secondes
        float progress = mod(time * 0.154, 2.0);
        progress = clamp(progress, 0.0, 1.0);
        
        // Rayon du cercle qui grandit (de 0 à 1.2 pour couvrir tout l'écran)
        float circleRadius = progress * 1.2;
        
        // Zone de transition douce pour les bords du cercle
        float transitionWidth = 0.12;
        float transitionStart = circleRadius - transitionWidth;
        float transitionEnd = circleRadius + transitionWidth * 0.2;
        
        // Calculer le facteur de mélange avec smoothstep pour une transition douce
        float mixFactor = smoothstep(transitionStart, transitionEnd, normalizedDist);
        
        // Ajouter des variations de bruit pour rendre la transition plus organique et diffuse
        float noiseValue = smoothNoise(uv * 6.0 + time * 0.08) * 0.04;
        mixFactor = clamp(mixFactor + noiseValue, 0.0, 1.0);
        
        // Normaliser la distance pour le dégradé radial (0 = centre, 1 = bord)
        // Utiliser une fonction pour étirer le dégradé vers l'extérieur
        float gradientDist = normalizedDist / max(circleRadius, 0.001);
        gradientDist = pow(gradientDist, 0.8); // Étirer légèrement pour un meilleur effet
        
        // Obtenir la couleur du dégradé radial
        vec3 gradientColor = sunriseGradient(gradientDist);
        
        // Ajouter un effet de diffusion/flou sur la zone de transition
        float blurIntensity = (1.0 - abs(mixFactor - 0.5) * 2.0) * 0.03;
        if (blurIntensity > 0.001) {
          // Échantillonnage simple pour le flou
          vec3 blurredColor = vec3(0.0);
          float totalWeight = 0.0;
          int samples = 6;
          for (int i = 0; i < samples; i++) {
            float angle = float(i) * 6.28318 / float(samples);
            float radius = blurIntensity * 0.01;
            vec2 offset = vec2(cos(angle), sin(angle)) * radius;
            vec2 sampleUV = uv + offset;
            
            if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
              float sampleDist = distance(sampleUV, origin) / maxDist;
              float sampleGradientDist = sampleDist / max(circleRadius, 0.001);
              sampleGradientDist = pow(sampleGradientDist, 0.8);
              float weight = 1.0 / (1.0 + length(offset) * 50.0);
              blurredColor += sunriseGradient(sampleGradientDist) * weight;
              totalWeight += weight;
            }
          }
          if (totalWeight > 0.0) {
            gradientColor = mix(gradientColor, blurredColor / totalWeight, blurIntensity * 8.0);
          }
        }
        
        // Mélanger le blanc et le dégradé avec une transition douce
        vec3 color = mix(vec3(1.0), gradientColor, 1.0 - mixFactor);
        
        // Ajouter un effet de brillance diffuse sur le bord du cercle
        float edgeDistance = abs(normalizedDist - circleRadius);
        float edgeGlow = exp(-edgeDistance * 12.0) * (1.0 - mixFactor) * 0.2;
        color += vec3(1.0, 0.8, 0.5) * edgeGlow;
        
        gl_FragColor = vec4(color, 1.0);
      }
    `

    // Initialize Three.js scene
    const camera = new THREE.Camera()
    camera.position.z = 1

    const scene = new THREE.Scene()
    const geometry = new THREE.PlaneGeometry(2, 2)

    const uniforms = {
      time: { type: "f", value: 1.0 },
      resolution: { type: "v2", value: new THREE.Vector2() },
    }

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)

    container.appendChild(renderer.domElement)

    // Handle window resize
    const onWindowResize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height)
      uniforms.resolution.value.x = renderer.domElement.width
      uniforms.resolution.value.y = renderer.domElement.height
    }

    // Initial resize
    onWindowResize()
    window.addEventListener("resize", onWindowResize, false)

    // Animation loop
    const animate = () => {
      const animationId = requestAnimationFrame(animate)
      uniforms.time.value += 0.015
      renderer.render(scene, camera)

      if (sceneRef.current) {
        sceneRef.current.animationId = animationId
      }
    }

    // Store scene references for cleanup
    sceneRef.current = {
      camera,
      scene,
      renderer,
      uniforms,
      animationId: 0,
    }

    // Start animation
    animate()

    // Cleanup function
    return () => {
      window.removeEventListener("resize", onWindowResize)

      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId)

        if (container && sceneRef.current.renderer.domElement) {
          container.removeChild(sceneRef.current.renderer.domElement)
        }

        sceneRef.current.renderer.dispose()
        geometry.dispose()
        material.dispose()
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-screen"
      style={{
        background: "#fff",
        overflow: "hidden",
      }}
    />
  )
}
