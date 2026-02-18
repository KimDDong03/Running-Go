export const createCurrentLocationMarkerElement = (
  imageUrl?: string | null,
  options?: { size?: number }
) => {
  const markerSize = options?.size ?? 24;
  const coreSize = Math.max(12, Math.round(markerSize * 0.58));
  const marker = document.createElement('div');
  marker.style.position = 'relative';
  marker.style.width = `${markerSize}px`;
  marker.style.height = `${markerSize}px`;

  const halo = document.createElement('span');
  halo.style.position = 'absolute';
  halo.style.inset = '0';
  halo.style.borderRadius = '9999px';
  halo.style.background = 'rgba(14, 165, 233, 0.24)';
  halo.style.boxShadow = '0 0 0 2px rgba(125, 211, 252, 0.6)';

  const core = document.createElement('span');
  core.style.position = 'absolute';
  core.style.left = '50%';
  core.style.top = '50%';
  core.style.width = `${coreSize}px`;
  core.style.height = `${coreSize}px`;
  core.style.transform = 'translate(-50%, -50%)';
  core.style.borderRadius = '9999px';
  core.style.overflow = 'hidden';
  core.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.95)';
  core.style.display = 'flex';
  core.style.alignItems = 'center';
  core.style.justifyContent = 'center';

  if (imageUrl) {
    core.style.backgroundImage = `url(${imageUrl})`;
    core.style.backgroundPosition = 'center';
    core.style.backgroundSize = 'cover';
    core.style.backgroundRepeat = 'no-repeat';
  } else {
    core.style.background = '#0ea5e9';
    core.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" fill="white"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="white"/></svg>';
  }

  marker.appendChild(halo);
  marker.appendChild(core);

  const heading = document.createElement('span');
  heading.dataset.role = 'heading-indicator';
  heading.style.position = 'absolute';
  heading.style.left = '50%';
  heading.style.top = '50%';
  heading.style.width = `${markerSize}px`;
  heading.style.height = `${markerSize}px`;
  heading.style.transform = 'translate(-50%, -50%) rotate(0deg)';
  heading.style.transformOrigin = '50% 50%';
  heading.style.pointerEvents = 'none';
  heading.style.overflow = 'visible';
  heading.style.opacity = '0';
  heading.style.transition = 'opacity 120ms ease-out';

  const headingArc = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  headingArc.setAttribute('viewBox', '0 0 28 28');
  headingArc.setAttribute('width', '30');
  headingArc.setAttribute('height', '30');
  headingArc.style.position = 'absolute';
  headingArc.style.left = '50%';
  headingArc.style.top = '50%';
  headingArc.style.transform = 'translate(-50%, -50%) translateY(-10px)';
  headingArc.style.filter = 'drop-shadow(0 3px 6px rgba(2,132,199,0.25))';

  const arcPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arcPath.setAttribute('d', 'M6.4 5.3 A11.6 11.6 0 0 1 21.6 5.3');
  arcPath.setAttribute('fill', 'none');
  arcPath.setAttribute('stroke', 'rgba(14, 165, 233, 0.94)');
  arcPath.setAttribute('stroke-width', '3.8');
  arcPath.setAttribute('stroke-linecap', 'round');

  const pointer = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pointer.setAttribute('d', 'M14 1.8 L11.8 6.2 H16.2 Z');
  pointer.setAttribute('fill', 'rgba(14, 165, 233, 0.98)');

  headingArc.appendChild(arcPath);
  headingArc.appendChild(pointer);
  heading.appendChild(headingArc);
  marker.appendChild(heading);

  return marker;
};
