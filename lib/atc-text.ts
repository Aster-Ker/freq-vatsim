/**
 * Turns recognizer output (lower case words, no punctuation) into the way a
 * transmission is written down: digits as numerals, frequencies with their
 * decimal point, flight levels as FL350.
 *
 *   "turn left heading two seven zero"          -> "Turn left heading 270"
 *   "contact london one one eight decimal five" -> "Contact london 118.5"
 *   "climb flight level three five zero"        -> "Climb FL350"
 */
const DIGITS: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  tree: '3',
  four: '4',
  five: '5',
  fife: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  niner: '9',
};

const POINT = new Set(['decimal', 'point', 'dayseemal']);

export function formatTransmission(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;

  while (i < words.length) {
    // A run of spoken digits, optionally split once by "decimal".
    if (DIGITS[words[i]] !== undefined) {
      let num = '';
      let hasPoint = false;
      while (i < words.length) {
        const w = words[i];
        if (DIGITS[w] !== undefined) {
          num += DIGITS[w];
          i++;
        } else if (!hasPoint && POINT.has(w) && DIGITS[words[i + 1]] !== undefined && num.length > 0) {
          num += '.';
          hasPoint = true;
          i++;
        } else {
          break;
        }
      }
      // "oh" on its own is usually the word, not a zero.
      if (num === '0' && words[i - 1] === 'oh') out.push('oh');
      else if (out.length >= 2 && out[out.length - 2] === 'flight' && out[out.length - 1] === 'level') {
        out.splice(out.length - 2, 2, `FL${num}`);
      } else out.push(num);
      continue;
    }
    out.push(words[i]);
    i++;
  }

  const text = out.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
