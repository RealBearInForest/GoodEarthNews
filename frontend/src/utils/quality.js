// Device-adaptive rendering quality. Phones get a lighter scene (fewer trees,
// no shadows, capped pixel ratio) so the globe stays smooth and cool-handed;
// desktops keep full quality.

export const IS_TOUCH =
  typeof window !== 'undefined' &&
  (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

// Touch + small screen = phone/small tablet. Touch laptops keep desktop quality.
export const IS_MOBILE =
  IS_TOUCH && Math.min(window.screen.width, window.screen.height) < 820;

export const QUALITY = IS_MOBILE
  ? { treeCap: 1500, shadows: false, antialias: false, dpr: [1, 1.75], stars: 3000 }
  : { treeCap: 3500, shadows: true,  antialias: true,  dpr: [1, 2],    stars: 6000 };

// WebGL support check — used to swap the 3D globe for a plain story list on
// browsers/devices that can't render it.
export function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}
