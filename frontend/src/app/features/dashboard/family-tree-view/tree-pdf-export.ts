import { jsPDF } from 'jspdf';

// Presentation properties that come from the component's SCSS classes. They
// must be copied inline, because a serialized SVG drawn as an image can't
// see the page's stylesheets.
const STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
] as const;

const RENDER_SCALE = 2; // 2x pixels so text stays crisp when zoomed in the PDF
const TITLE_HEIGHT = 48;

/**
 * Exports the on-screen family tree SVG to a PDF that looks the same as the
 * UI (same background, colors, links and labels). The current zoom level is
 * ignored, so the whole tree is always exported at full size.
 */
export async function exportTreeSvgToPdf(
  svg: SVGSVGElement,
  size: { width: number; height: number },
  title: string,
  fileName: string,
): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(size.width));
  clone.setAttribute('height', String(size.height));

  const image = await loadSvgAsImage(new XMLSerializer().serializeToString(clone));

  const canvasWidth = size.width;
  const canvasHeight = size.height + TITLE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth * RENDER_SCALE;
  canvas.height = canvasHeight * RENDER_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is not supported in this browser.');
  }
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  // Title band in the same dark blue as the top of the tree background.
  ctx.fillStyle = '#1c4d73';
  ctx.fillRect(0, 0, canvasWidth, TITLE_HEIGHT);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 20px Roboto, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 20, TITLE_HEIGHT / 2);

  ctx.drawImage(image, 0, TITLE_HEIGHT, size.width, size.height);

  // Page size = image size (in pt), so the tree is never cropped or squashed.
  const pdf = new jsPDF({
    orientation: canvasWidth >= canvasHeight ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [canvasWidth, canvasHeight],
  });
  pdf.setProperties({ title });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvasWidth, canvasHeight);
  pdf.save(fileName);
}

function inlineComputedStyles(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  const inline = STYLE_PROPS.map((prop) => `${prop}:${computed.getPropertyValue(prop)}`).join(';');
  target.setAttribute('style', `${target.getAttribute('style') ?? ''};${inline}`);
  // Hover effects shouldn't leak into the export.
  if (target instanceof SVGElement) {
    target.style.removeProperty('filter');
  }

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  sourceChildren.forEach((child, i) => {
    const targetChild = targetChildren[i];
    if (targetChild) {
      inlineComputedStyles(child, targetChild);
    }
  });
}

function loadSvgAsImage(svgMarkup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render the family tree for export.'));
    };
    img.src = url;
  });
}
