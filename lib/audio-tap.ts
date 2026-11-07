/**
 * Injected into the VATSIM Listen page before its own scripts run.
 *
 * It listens to whatever the page plays and hands it to the app as 16 kHz mono
 * 16-bit PCM, which is what the on-device recognizer takes. It never changes
 * what you hear: every tap is an extra branch off the page's audio, and it is
 * silent unless subtitles are on.
 *
 * A browser plays audio in one of two ways, and both are covered:
 *  - Web Audio: any node connected to an AudioContext's destination also feeds
 *    a tap in the same context.
 *  - A media element (<audio>, including a WebRTC stream as srcObject): its
 *    stream is copied into a separate context with captureStream, which leaves
 *    the element playing as before.
 *
 * Should the page use both for the same sound, only one source is forwarded
 * at a time: the one that last carried sound.
 *
 * Messages: { t: 'pcm', d: base64 } every quarter second while sound is
 * present, and { t: 'tap', sources: n } when a source is found.
 *
 * Kept as a plain ES5 string so it runs in any WebView without a build step.
 */
export const AUDIO_TAP_SCRIPT = String.raw`
(function () {
  if (window.__freqTap) return;
  window.__freqTap = true;

  var TARGET_RATE = 16000;
  var CHUNK = 4000;            // 0.25 s at 16 kHz
  var SILENCE_RMS = 0.002;     // about -54 dBFS
  var TAIL_MS = 1200;          // keep sending this long after sound stops, so the recognizer can end the phrase
  var SWITCH_MS = 1000;        // a quiet source hands over after this long

  var enabled = false;
  var sources = [];
  var activeId = null;
  var out = new Int16Array(CHUNK);
  var outLen = 0;
  var lastLoud = 0;

  function post(msg) {
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }

  function flush() {
    if (!outLen) return;
    var bytes = new Uint8Array(out.buffer, 0, outLen * 2);
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    post({ t: 'pcm', d: btoa(bin) });
    out = new Int16Array(CHUNK);
    outLen = 0;
  }

  function makeSource(rate) {
    var src = { id: sources.length + 1, rate: rate, step: rate / TARGET_RATE, pos: 0, prev: 0, loudAt: 0 };
    sources.push(src);
    post({ t: 'tap', sources: sources.length });
    return src;
  }

  function handle(src, input) {
    if (!enabled) return;
    var now = Date.now();

    var sum = 0;
    for (var i = 0; i < input.length; i++) sum += input[i] * input[i];
    var loud = Math.sqrt(sum / input.length) > SILENCE_RMS;
    if (loud) src.loudAt = now;

    var current = null;
    for (var j = 0; j < sources.length; j++) if (sources[j].id === activeId) current = sources[j];
    if (!current || (loud && now - current.loudAt > SWITCH_MS)) activeId = src.id;
    if (src.id !== activeId) return;

    if (loud) lastLoud = now;
    if (now - lastLoud > TAIL_MS) {
      // Quiet: nothing to send, and the next phrase starts clean.
      src.pos = 0;
      flush();
      return;
    }

    // Linear resample from the context's rate to 16 kHz. pos is the read
    // position in this block, carried over between blocks.
    var pos = src.pos;
    while (pos < input.length) {
      var k = Math.floor(pos);
      var frac = pos - k;
      var a = k === 0 ? src.prev : input[k - 1];
      var b = input[k];
      var s = a + (b - a) * frac;
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      out[outLen++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (outLen === CHUNK) flush();
      pos += src.step;
    }
    src.pos = pos - input.length;
    src.prev = input[input.length - 1];
  }

  // One tap per AudioContext: a mono ScriptProcessor pulled through a muted
  // gain, so it runs without adding anything to the output.
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  var origConnect = AudioNode.prototype.connect;
  var taps = typeof WeakMap === 'function' ? new WeakMap() : null;

  function tapFor(ctx) {
    var existing = taps && taps.get(ctx);
    if (existing) return existing;
    var proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.channelCount = 1;
    proc.channelCountMode = 'explicit';
    proc.channelInterpretation = 'speakers';
    var mute = ctx.createGain();
    mute.gain.value = 0;
    origConnect.call(proc, mute);
    origConnect.call(mute, ctx.destination);
    var src = makeSource(ctx.sampleRate);
    proc.onaudioprocess = function (e) { handle(src, e.inputBuffer.getChannelData(0)); };
    if (taps) taps.set(ctx, proc);
    return proc;
  }

  AudioNode.prototype.connect = function (dest) {
    var result = origConnect.apply(this, arguments);
    try {
      if (dest instanceof AudioDestinationNode && !this.__freqInternal) {
        origConnect.call(this, tapFor(this.context));
      }
    } catch (e) {}
    return result;
  };

  // Media elements, through a context of our own.
  var ownCtx = null;
  function tapElement(el) {
    if (!el || el.__freqTapped) return;
    var stream = null;
    try {
      if (el.srcObject && typeof MediaStream !== 'undefined' && el.srcObject instanceof MediaStream) stream = el.srcObject;
      else if (el.captureStream) stream = el.captureStream();
    } catch (e) {}
    if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) {
      // A captured stream gets its tracks once playback starts; try again shortly.
      if (!el.__freqRetry) {
        el.__freqRetry = true;
        setTimeout(function () { el.__freqRetry = false; tapElement(el); }, 500);
      }
      return;
    }
    el.__freqTapped = true;
    try {
      ownCtx = ownCtx || new Ctx();
      if (ownCtx.state === 'suspended') ownCtx.resume();
      var node = ownCtx.createMediaStreamSource(stream);
      node.__freqInternal = true;
      origConnect.call(node, tapFor(ownCtx));
    } catch (e) {
      el.__freqTapped = false;
    }
  }

  document.addEventListener('play', function (e) { tapElement(e.target); }, true);
  document.addEventListener('playing', function (e) { tapElement(e.target); }, true);

  window.__freqSetCaptions = function (on) {
    enabled = !!on;
    if (!enabled) { outLen = 0; activeId = null; }
    if (ownCtx && ownCtx.state === 'suspended') ownCtx.resume();
    var els = document.querySelectorAll('audio, video');
    for (var i = 0; i < els.length; i++) if (!els[i].paused) tapElement(els[i]);
    return enabled;
  };
})();
true;
`;

/** Turns forwarding on or off in a page that already has the tap. */
export const setCaptionsScript = (on: boolean) =>
  `window.__freqSetCaptions && window.__freqSetCaptions(${on ? 'true' : 'false'}); true;`;
