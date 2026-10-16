import { useEffect, useMemo, useRef, useState } from "react";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: (e: { error?: string }) => void;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

/** iPhone and iPad Safari: continuous listening is unreliable there, so each phrase restarts the mic. */
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1));

/** How long the mic waits for more speech before it turns itself off. */
const IDLE_MS = 60000;

/** Spoken edits, so a coach can fix a message without touching the keyboard. */
const VOICE_EDITS: { re: RegExp; edit: "phrase" | "word" | "clear" | "stop" | "send" }[] = [
  { re: /^(scratch|delete|undo|remove) (that|the last (part|phrase|bit))$/, edit: "phrase" },
  { re: /^(delete|remove|back) (the )?last word$/, edit: "word" },
  { re: /^(clear( it| all| everything)?|start over)$/, edit: "clear" },
  { re: /^(done|stop|stop listening|that's it|that is it)$/, edit: "stop" },
  { re: /^(read it|go|draw it|send( it)?)$/, edit: "send" },
];

/** Browser speech-to-text, where the browser has it (Chrome, Edge, Safari). */
function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * An always-on mic that types into a text box: it restarts after the
 * browser's pauses until the coach says "done", takes spoken edits
 * ("scratch that", "delete last word", "clear", "send it"), and turns itself
 * off after a minute of quiet.
 */
export function useDictation(text: string, setText: (next: string) => void, onSend: (text: string) => void) {
  const Speech = useMemo(speechRecognition, []);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const recog = useRef<Recognition | null>(null);
  // The coach wants the mic on: browsers end a session after a pause, and it restarts until they say Done.
  const wantMic = useRef(false);
  const idle = useRef<number | undefined>(undefined);
  /** Each spoken phrase added, so "scratch that" takes back exactly the last one. */
  const phrases = useRef<string[]>([]);
  // The text as it stands right now, so spoken edits stack correctly between renders.
  const textRef = useRef(text);
  textRef.current = text;
  const sendRef = useRef(onSend);
  sendRef.current = onSend;

  useEffect(
    () => () => {
      wantMic.current = false;
      window.clearTimeout(idle.current);
      recog.current?.abort?.();
    },
    [],
  );

  const edit = (fn: (c: string) => string) => {
    const next = fn(textRef.current);
    textRef.current = next;
    setText(next);
  };

  function stop(message: string | null = null) {
    wantMic.current = false;
    window.clearTimeout(idle.current);
    recog.current?.stop();
    setListening(false);
    setHeard("");
    setNote(message);
  }

  function armIdle() {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => stop("The mic turned off after a minute of quiet. Tap it to keep going."), IDLE_MS);
  }

  /** Delete button: the last spoken phrase if there is one, else the last word. */
  function deleteLast() {
    const last = phrases.current.pop();
    edit((c) => (last && c.endsWith(last) ? c.slice(0, -last.length) : c.replace(/\s*\S+\s*$/, "")).trimEnd());
  }

  function clear() {
    phrases.current = [];
    edit(() => "");
  }

  /** One finished phrase: a spoken edit, or more of the message. */
  function takePhrase(raw: string) {
    const said = raw.trim();
    if (!said) return;
    const cmd = VOICE_EDITS.find((v) => v.re.test(said.toLowerCase().replace(/[.!?,]/g, "")));
    if (cmd?.edit === "phrase") return deleteLast();
    if (cmd?.edit === "word") {
      phrases.current = [];
      return edit((c) => c.replace(/\s*\S+\s*$/, ""));
    }
    if (cmd?.edit === "clear") return clear();
    if (cmd?.edit === "stop") return stop();
    if (cmd?.edit === "send") {
      stop();
      sendRef.current(textRef.current);
      return;
    }
    edit((c) => {
      const piece = c && !/\s$/.test(c) ? ` ${said}` : said;
      phrases.current.push(piece);
      return `${c}${piece}`;
    });
  }

  function startSession() {
    if (!Speech) return;
    // One recognizer for the whole session; iOS chimes and stalls when a new one starts each time.
    const r = recog.current ?? new Speech();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = !isIOS();
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) takePhrase(res[0].transcript);
        else live += res[0].transcript;
      }
      setHeard(live);
      armIdle();
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stop("Your browser blocked the microphone. Allow it for this site in the browser's settings, then tap the mic again.");
      } else if (e.error === "audio-capture") {
        stop("No microphone was found. Plug one in or type instead.");
      }
      // "no-speech" and "aborted" fall through to onend, which restarts while the coach still wants the mic.
    };
    r.onend = () => {
      setHeard("");
      if (!wantMic.current) {
        setListening(false);
        return;
      }
      window.setTimeout(() => {
        if (!wantMic.current) return;
        try {
          r.start();
        } catch {
          /* already starting — the next end will try again */
        }
      }, 250);
    };
    recog.current = r;
    try {
      r.start();
    } catch {
      /* already running */
    }
  }

  function toggle() {
    if (!Speech) return;
    if (listening) return stop();
    wantMic.current = true;
    phrases.current = [];
    setNote(null);
    setListening(true);
    armIdle();
    startSession();
  }

  return {
    supported: Boolean(Speech),
    listening,
    heard,
    note,
    toggle,
    stop,
    deleteLast,
    clear,
    /** Typing by hand ends any half-spoken phrase. */
    forgetPhrases: () => (phrases.current = []),
  };
}
