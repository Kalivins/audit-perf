/**
 * Sortie console. Aucune dependance, couleurs desactivables via NO_COLOR.
 *
 * ESC est construit avec fromCharCode plutot qu'ecrit litteralement : un
 * caractere d'echappement brut dans le source est invisible en revue et
 * survit mal aux copier-coller.
 */

const ESC = String.fromCharCode(27);

const noColor =
  process.env.NO_COLOR !== undefined ||
  process.env.TERM === 'dumb' ||
  !process.stdout.isTTY;

const wrap = (open, close) => (s) =>
  noColor ? String(s) : `${ESC}[${open}m${s}${ESC}[${close}m`;

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  grey: wrap(90, 39),
};

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
let level = LEVELS.info;

export function setLevel(name) {
  if (name in LEVELS) level = LEVELS[name];
}

function out(stream, text) {
  stream.write(text + '\n');
}

export const log = {
  debug(...a) {
    if (level >= LEVELS.debug) out(process.stderr, c.grey('  ' + a.join(' ')));
  },
  info(...a) {
    if (level >= LEVELS.info) out(process.stdout, a.join(' '));
  },
  step(...a) {
    if (level >= LEVELS.info) out(process.stdout, c.cyan('> ') + a.join(' '));
  },
  ok(...a) {
    if (level >= LEVELS.info) out(process.stdout, c.green('  ok ') + a.join(' '));
  },
  warn(...a) {
    if (level >= LEVELS.warn) out(process.stderr, c.yellow('  ! ') + a.join(' '));
  },
  error(...a) {
    if (level >= LEVELS.error) out(process.stderr, c.red('  x ') + a.join(' '));
  },
  /** Ligne brute, sans prefixe ni filtrage de niveau. */
  raw(text = '') {
    out(process.stdout, text);
  },
  blank() {
    if (level >= LEVELS.info) out(process.stdout, '');
  },
};

/**
 * Compteur de progression reecrit sur place dans un vrai terminal, sinon une
 * ligne par evenement pour rester lisible quand la sortie est redirigee.
 */
export function progress(total, label = '') {
  const CLEAR_LINE = `\r${ESC}[2K`;
  let done = 0;
  const interactive = process.stdout.isTTY && level >= LEVELS.info;
  return {
    tick(detail = '') {
      done += 1;
      if (level < LEVELS.info) return;
      const text = `  ${done}/${total} ${label} ${c.grey(detail)}`;
      if (interactive) {
        process.stdout.write(CLEAR_LINE + text.slice(0, 110));
      } else {
        out(process.stdout, text);
      }
    },
    done() {
      if (interactive && level >= LEVELS.info) process.stdout.write(CLEAR_LINE);
    },
  };
}
