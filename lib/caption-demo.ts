/**
 * Sample subtitles for the web design preview, which has no recognizer. Only
 * used when window.__freqDemo is set; never on a phone.
 */
type Listener<T> = (e: T) => void;

const SCRIPT = [
  'speedbird four one two heathrow tower runway two seven left cleared to land wind two five zero one two',
  'cleared to land two seven left speedbird four one two',
  'shamrock seven five one line up and wait runway two seven right',
  'line up and wait two seven right shamrock seven five one',
  'speedbird four one two vacate left at alpha four contact ground one two one decimal niner',
];

let captionListeners: Listener<{ text: string; final: boolean }>[] = [];
let stateListeners: Listener<{ state: 'ready' | 'error'; message?: string }>[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

export const demoCaptionSource = {
  available: true,
  isModelInstalled: () => true,
  modelSizeBytes: () => 71_000_000,
  downloadModel: () => Promise.resolve(true),
  deleteModel: () => {},
  start: () => {
    setTimeout(() => stateListeners.forEach((l) => l({ state: 'ready' })), 600);
    if (timer) return;
    let i = 0;
    let word = 0;
    timer = setInterval(() => {
      const words = SCRIPT[i % SCRIPT.length].split(' ');
      word = Math.min(words.length, word + 3);
      const done = word >= words.length;
      captionListeners.forEach((l) => l({ text: words.slice(0, word).join(' '), final: done }));
      if (done) {
        i++;
        word = 0;
      }
    }, 350);
  },
  feed: () => {},
  flush: () => {},
  stop: () => {
    if (timer) clearInterval(timer);
    timer = null;
  },
  onCaption: (l: Listener<{ text: string; final: boolean }>) => {
    captionListeners.push(l);
    return { remove: () => (captionListeners = captionListeners.filter((x) => x !== l)) };
  },
  onState: (l: Listener<{ state: 'ready' | 'error'; message?: string }>) => {
    stateListeners.push(l);
    return { remove: () => (stateListeners = stateListeners.filter((x) => x !== l)) };
  },
  onModelProgress: (_: Listener<{ received: number; total: number }>) => ({ remove: () => {} }),
};
