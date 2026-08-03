/**
 * Images, vues depuis le HTML seul.
 *
 * Lighthouse mesure ces memes defauts en octets economisables. Les constats
 * emis ici portent volontairement les memes identifiants : quand Lighthouse a
 * tourne, sa version chiffree remplace celle-ci au moment de la consolidation.
 * Le mode rapide garde ainsi un signal exploitable sans lancer de navigateur.
 */

const LEGACY_FORMAT = /\.(jpe?g|png|gif|bmp|tiff?)(\?|#|$)/i;
const MODERN_FORMAT = /\.(webp|avif)(\?|#|$)|image\/(webp|avif)/i;

/** Les premieres images sont visibles d'emblee : les differer les ralentit. */
const ABOVE_THE_FOLD = 2;

function hasModernAlternative(img) {
  const srcset = img.getAttribute('srcset') || '';
  if (MODERN_FORMAT.test(srcset)) return true;

  const picture = img.parentNode;
  if (picture?.rawTagName?.toLowerCase() === 'picture') {
    for (const source of picture.querySelectorAll('source')) {
      const type = source.getAttribute('type') || '';
      if (MODERN_FORMAT.test(type) || MODERN_FORMAT.test(source.getAttribute('srcset') || '')) {
        return true;
      }
    }
  }
  return false;
}

export function checkImages({ dom }) {
  const findings = [];
  const images = dom.querySelectorAll('img');

  if (!images.length) {
    return {
      findings,
      summary: { total: 0, format_ancien: 0, sans_dimensions: 0, sans_lazy: 0 },
    };
  }

  const legacy = [];
  const withoutDimensions = [];
  const withoutLazy = [];

  images.forEach((img, index) => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';

    if (src && LEGACY_FORMAT.test(src) && !hasModernAlternative(img)) {
      legacy.push(src);
    }

    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    const styled = /(^|;)\s*(width|height|aspect-ratio)\s*:/i.test(
      img.getAttribute('style') || ''
    );
    if (!width && !height && !styled) withoutDimensions.push(src);

    const loading = (img.getAttribute('loading') || '').toLowerCase();
    if (index >= ABOVE_THE_FOLD && loading !== 'lazy' && loading !== 'eager') {
      withoutLazy.push(src);
    }
  });

  // Seuils volontairement prudents : une seule image ancienne sur un site n'est
  // pas un probleme, et un rapport client ne doit pas gonfler ses constats.
  if (legacy.length >= 3 || legacy.length / images.length > 0.6) {
    findings.push({
      id: 'images-format-ancien',
      source: 'html',
      evidence: {
        concernees: legacy.length,
        total: images.length,
        exemples: legacy.slice(0, 3),
      },
    });
  }

  if (withoutDimensions.length >= 3) {
    findings.push({
      id: 'images-sans-dimensions',
      source: 'html',
      evidence: { concernees: withoutDimensions.length, total: images.length },
    });
  }

  if (withoutLazy.length >= 5) {
    findings.push({
      id: 'images-sans-chargement-differe',
      source: 'html',
      evidence: { concernees: withoutLazy.length, total: images.length },
    });
  }

  return {
    findings,
    summary: {
      total: images.length,
      format_ancien: legacy.length,
      sans_dimensions: withoutDimensions.length,
      sans_lazy: withoutLazy.length,
    },
  };
}
