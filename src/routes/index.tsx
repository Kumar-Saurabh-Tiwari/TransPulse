import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FileJson,
  FileText,
  Languages,
  Mic,
  Pause,
  Play,
  Radio,
  ScrollText,
  Search,
  Settings2,
  Square,
  Waves,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TransPulse — Live captions, in the moment" },
      {
        name: "description",
        content:
          "A live-captioning studio with a streaming demo, microphone transcription, and searchable transcript exports.",
      },
      { property: "og:title", content: "TransPulse — Live captions, in the moment" },
      {
        property: "og:description",
        content:
          "A live-captioning studio with a streaming demo, microphone transcription, and searchable transcript exports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransPulse,
});

type Caption = { id: number; original: string; translation: string; time: string };
type Utterance = { original: string; translation: string };

const languages = [
  { value: "ja-JP", label: "Japanese", native: "日本語" },
  { value: "es-ES", label: "Spanish", native: "Español" },
  { value: "de-DE", label: "German", native: "Deutsch" },
  { value: "fr-FR", label: "French", native: "Français" },
  { value: "ko-KR", label: "Korean", native: "한국어" },
  { value: "en-US", label: "English", native: "English" },
];

const presets: Record<
  string,
  { title: string; category: string; language: string; lines: Utterance[] }
> = {
  keynote: {
    title: "The next era of computing",
    category: "TECH KEYNOTE",
    language: "ja-JP",
    lines: [
      { original: "皆さん、こんばんは。今日は新しい発表を共有します。", translation: "Good evening, everyone. Today, we’re sharing something new." },
      { original: "テクノロジーは人々をもっと近づけるべきです。", translation: "Technology should bring people closer together." },
      { original: "そのために、小さな一歩から始めました。", translation: "That’s why we started with one small step." },
      { original: "次世代のコンピューティングについてお話しします。", translation: "Let me tell you about the next generation of computing." },
      { original: "デザインと知能がひとつになる未来です。", translation: "A future where design and intelligence become one." },
      { original: "使う人のことを考えて作りました。", translation: "Every detail was made with people in mind." },
    ],
  },
  conversation: {
    title: "A long-awaited reunion",
    category: "CASUAL CONVERSATION",
    language: "ja-JP",
    lines: [
      { original: "やっと会えたね。元気だった？", translation: "We finally got to meet. How have you been?" },
      { original: "本当に久しぶり。元気だよ、ありがとう。", translation: "It’s been so long. I’m good, thanks for asking." },
      { original: "最近、新しいカフェを見つけたんだ。", translation: "I found a lovely new café recently." },
      { original: "いいね。あとで一緒に行こうよ。", translation: "That sounds lovely. Let’s go together later." },
      { original: "あそこのケーキはすごくおいしいよ。", translation: "The cake they make there is really delicious." },
    ],
  },
  meeting: {
    title: "Making the work matter",
    category: "TEAM MEETING",
    language: "de-DE",
    lines: [
      { original: "Vielen Dank, dass ihr euch heute Zeit genommen habt.", translation: "Thank you all for making time to meet today." },
      { original: "Unser nächster Schritt ist die Nutzerforschung.", translation: "Our next step is conducting user research." },
      { original: "Können wir bis Freitag drei Ideen testen?", translation: "Could we test three ideas by Friday?" },
      { original: "Das klingt gut. Ich kümmere mich um den Zeitplan.", translation: "Sounds good. I’ll take care of the timeline." },
      { original: "Dann besprechen wir die Ergebnisse nächste Woche.", translation: "Let’s review what we learn next week." },
    ],
  },
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function TransPulse() {
  const [mode, setMode] = useState<"demo" | "mic">("demo");
  const [preset, setPreset] = useState("keynote");
  const [sourceLanguage, setSourceLanguage] = useState("ja-JP");
  const [targetLanguage, setTargetLanguage] = useState("en-US");
  const [running, setRunning] = useState(false);
  const [bilingual, setBilingual] = useState(true);
  const [fontSize, setFontSize] = useState([34]);
  const [opacity, setOpacity] = useState([82]);
  const [pace, setPace] = useState([48]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [transcript, setTranscript] = useState<Caption[]>([]);
  const [currentOriginal, setCurrentOriginal] = useState("");
  const [currentTranslation, setCurrentTranslation] = useState("");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState("00:00:00");
  const [exportOpen, setExportOpen] = useState(false);
  const [clipboardId, setClipboardId] = useState<number | null>(null);
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);
  const [turn, setTurn] = useState(0);
  const isMobile = useIsMobile();

  const presetRef = useRef(preset);
  const runningRef = useRef(false);
  const indexRef = useRef(0);
  const turnRef = useRef(0);
  const wordTimerRef = useRef<number | undefined>(undefined);
  const sentenceTimerRef = useRef<number | undefined>(undefined);
  const recognitionRef = useRef<{
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  } | null>(null);

  const targetLabel = useMemo(
    () => languages.find((language) => language.value === targetLanguage)?.label ?? "English",
    [targetLanguage],
  );
  const paceInterval = Math.round(Math.max(95, 305 - pace[0] * 2.1));

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecognitionAvailable(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now() - transcript.length * 12_000;
    const timer = window.setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setClock(new Date(elapsed * 1000).toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, transcript.length]);

  const finishCaption = useCallback((original: string, translation: string) => {
    if (!original.trim() && !translation.trim()) return;
    const caption: Caption = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      original: original.trim(),
      translation: translation.trim() || original.trim(),
      time: formatTime(new Date()),
    };
    setTranscript((previous) => [...previous, caption]);
    setCurrentOriginal("");
    setCurrentTranslation("");
    setTurn((previous) => previous + 1);
  }, []);

  const speakNext = useCallback(() => {
    const activePreset = presets[presetRef.current];
    const utterance = activePreset.lines[indexRef.current % activePreset.lines.length];
    indexRef.current += 1;
    const originalWords = utterance.original.split(" ");
    const translatedWords = utterance.translation.split(" ");
    let position = 0;
    const tick = () => {
      if (!runningRef.current) return;
      position += 1;
      const originalProgress = Math.max(
        1,
        Math.ceil((position / translatedWords.length) * originalWords.length),
      );
      setCurrentOriginal(
        originalWords.slice(0, Math.min(originalProgress, originalWords.length)).join(" "),
      );
      setCurrentTranslation(
        translatedWords.slice(0, Math.min(position, translatedWords.length)).join(" "),
      );
      if (position < translatedWords.length) {
        wordTimerRef.current = window.setTimeout(tick, paceInterval);
      } else {
        sentenceTimerRef.current = window.setTimeout(() => {
          if (!runningRef.current) return;
          finishCaption(utterance.original, utterance.translation);
          sentenceTimerRef.current = window.setTimeout(speakNext, 700);
        }, 1150);
      }
    };
    wordTimerRef.current = window.setTimeout(tick, 300);
  }, [finishCaption, paceInterval]);

  useEffect(() => {
    return () => {
      if (wordTimerRef.current) window.clearTimeout(wordTimerRef.current);
      if (sentenceTimerRef.current) window.clearTimeout(sentenceTimerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  const stopStream = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (wordTimerRef.current) window.clearTimeout(wordTimerRef.current);
    if (sentenceTimerRef.current) window.clearTimeout(sentenceTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (mode === "demo" && (currentOriginal || currentTranslation)) {
      finishCaption(currentOriginal, currentTranslation);
    }
  }, [currentOriginal, currentTranslation, finishCaption, mode]);

  const startStream = useCallback(() => {
    if (running) {
      stopStream();
      return;
    }
    if (mode === "mic") {
      const RecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!RecognitionConstructor) {
        setNotice(
          "Live microphone captions aren’t supported by this browser. Try Chrome or Microsoft Edge.",
        );
        return;
      }
      setNotice(
        "Microphone captions show recognized speech as-is; translation isn’t connected in this demo.",
      );
      const recognition = new RecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = sourceLanguage;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalText = "";
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal) finalText += result[0]?.transcript ?? "";
          else interimText += result?.[0]?.transcript ?? "";
        }
        if (interimText) {
          setCurrentOriginal(interimText.trim());
          setCurrentTranslation(interimText.trim());
        }
        if (finalText.trim()) finishCaption(finalText, finalText);
      };
      recognition.onerror = () => {
        setNotice("Microphone access was interrupted. Allow microphone access in your browser to continue.");
        runningRef.current = false;
        setRunning(false);
      };
      recognition.onend = () => {
        if (runningRef.current && recognitionRef.current === recognition) {
          try {
            recognition.start();
          } catch {
            setNotice("Please check that your microphone is available and try again.");
          }
        }
      };
      recognitionRef.current = recognition;
      runningRef.current = true;
      setRunning(true);
      setClock("00:00:00");
      setNotice("");
      try {
        recognition.start();
      } catch {
        runningRef.current = false;
        setRunning(false);
        recognitionRef.current = null;
        setNotice("Could not start the microphone. Check browser permission, then try again.");
      }
      return;
    }
    setNotice("");
    indexRef.current = 0;
    setClock("00:00:00");
    runningRef.current = true;
    setRunning(true);
    speakNext();
  }, [finishCaption, mode, running, sourceLanguage, speakNext, stopStream]);

  const choosePreset = (value: string) => {
    stopStream();
    setMode("demo");
    setPreset(value);
    setSourceLanguage(presets[value]?.language ?? "ja-JP");
    setCurrentOriginal("");
    setCurrentTranslation("");
    setTranscript([]);
    setTurn(0);
    setClock("00:00:00");
  };

  const clearCanvas = () => {
    setTranscript([]);
    setCurrentOriginal("");
    setCurrentTranslation("");
    setSearch("");
    setNotice("Transcript cleared.");
  };

  const copyCaption = async (caption: Caption) => {
    const text = `${caption.original}\n${caption.translation}`;
    try {
      await navigator.clipboard.writeText(text);
      setClipboardId(caption.id);
      window.setTimeout(
        () => setClipboardId((previous) => (previous === caption.id ? null : previous)),
        1400,
      );
    } catch {
      setNotice("Could not copy the caption. Check clipboard permission in your browser.");
    }
  };

  const exportTranscript = (format: "txt" | "json" | "srt") => {
    const content =
      format === "json"
        ? JSON.stringify(
            transcript.map(({ original, translation, time }) => ({ time, original, translation })),
            null,
            2,
          )
        : format === "srt"
          ? transcript
              .map((entry, index) => {
                const seconds = index * 4;
                const stamp = (value: number) =>
                  `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(
                    Math.floor((value % 3600) / 60),
                  ).padStart(2, "0")}:${String(value % 60).padStart(2, "0")},000`;
                return `${index + 1}\n${stamp(seconds)} --> ${stamp(seconds + 4)}\n${entry.original}\n${entry.translation}`;
              })
              .join("\n\n")
          : transcript
              .map((entry) => `[${entry.time}]\n${entry.original}\n${entry.translation}`)
              .join("\n\n");
    const mimeType =
      format === "json" ? "application/json" : format === "srt" ? "text/srt" : "text/plain";
    const file = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `transpulse-transcript.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const presetInfo = presets[preset] ?? presets.keynote;
  const filteredTranscript = transcript.filter((entry) =>
    `${entry.original} ${entry.translation}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const captionWords = currentTranslation ? currentTranslation.split(" ") : [];

  const closeFloaters = () => {
    setSettingsOpen(false);
    setExportOpen(false);
  };

  const startButton = (
    <Button
      onClick={startStream}
      disabled={mode === "mic" && !recognitionAvailable}
      className={`control-primary ${running ? "" : "primary-glow"}`}
      aria-label={running ? "Pause session" : "Start session"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={running ? "pause" : "play"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="flex items-center gap-2"
        >
          {running ? (
            <>
              <Pause size={16} /> Pause
            </>
          ) : (
            <>
              <Play size={16} fill="currentColor" /> {mode === "mic" ? "Mic on" : "Start"}
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </Button>
  );

  const transcriptToggle = (
    <Button
      variant="ghost"
      size="icon"
      className="dock-button relative"
      onClick={() => setHistoryOpen((open) => !open)}
      aria-label="Toggle transcript"
    >
      <ScrollText size={17} />
      {transcript.length > 0 && (
        <span className="dock-badge">{transcript.length > 99 ? "99+" : transcript.length}</span>
      )}
    </Button>
  );

  return (
    <main className="studio relative min-h-screen overflow-x-clip text-foreground">
      <div className="backdrop" aria-hidden="true">
        <motion.div
          className="aurora aurora-a"
          animate={{ x: [0, 60, -30, 0], y: [0, -40, 30, 0], scale: [1, 1.15, 0.95, 1] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="aurora aurora-b"
          animate={{ x: [0, -70, 40, 0], y: [0, 50, -30, 0], scale: [1, 0.9, 1.12, 1] }}
          transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="backdrop-grid" />
        <div className="backdrop-grain" />
        <div className="backdrop-vignette" />
      </div>

      <header className="studio-header sticky top-0 z-30 border-b border-border/60">
        <div className="mx-auto flex h-[62px] w-full max-w-[1680px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <a href="#studio" className="group flex shrink-0 items-center gap-2.5" aria-label="TransPulse home">
            <motion.span
              className="brand-mark"
              whileHover={{ rotate: -8, scale: 1.06 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
            >
              <Activity size={18} strokeWidth={2.4} />
            </motion.span>
            <span className="font-display text-[17px] font-bold tracking-[0.3px]">
              TransPulse<span className="brand-dot">.</span>
            </span>
          </a>

          <motion.div
            className={`live-pill ${running ? "is-live" : ""}`}
            animate={running ? { boxShadow: [
              "0 0 0 0 color-mix(in oklab, var(--primary) 34%, transparent)",
              "0 0 18px 2px color-mix(in oklab, var(--primary) 22%, transparent)",
              "0 0 0 0 color-mix(in oklab, var(--primary) 34%, transparent)",
            ] } : {}}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className={running ? "live-dot is-live" : "live-dot"} />
            {running ? "ON AIR" : "STANDBY"}
          </motion.div>

          <div className="hidden min-w-0 items-center gap-1.5 md:flex">
            <Languages size={14} className="mr-1 text-primary" />
            <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
              <SelectTrigger aria-label="Source language" className="h-8 w-[124px] border-border/60 bg-card/70 text-xs shadow-none backdrop-blur">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((language) => (
                  <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="px-1 text-xs text-muted-foreground">→</span>
            <Select value={targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger aria-label="Caption language" className="h-8 w-[124px] border-border/60 bg-card/70 text-xs shadow-none backdrop-blur">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((language) => (
                  <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="header-button"
              aria-label="Subtitle settings"
              onClick={() => { setExportOpen(false); setSettingsOpen((open) => !open); }}
            >
              <Settings2 size={17} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="header-button"
              aria-label="Export transcript"
              onClick={() => { setSettingsOpen(false); setExportOpen((open) => !open); }}
            >
              <Download size={16} />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2 md:hidden">
          <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
            <SelectTrigger aria-label="Source language" className="h-9 flex-1 bg-card/70 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((language) => (
                <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">→</span>
          <Select value={targetLanguage} onValueChange={setTargetLanguage}>
            <SelectTrigger aria-label="Caption language" className="h-9 flex-1 bg-card/70 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((language) => (
                <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AnimatePresence>
          {(settingsOpen || exportOpen) && (
            <>
              <button className="panel-overlay" onClick={closeFloaters} aria-label="Close panel" />
              {settingsOpen ? (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: isMobile ? 24 : -10, scale: isMobile ? 1 : 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: isMobile ? 24 : -10, scale: isMobile ? 1 : 0.97 }}
                  transition={{ duration: 0.24, ease: EASE_OUT }}
                  className="float-panel settings-panel"
                >
                  <div className="panel-title">Subtitle settings</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span>Subtitle size</span><span className="text-muted-foreground">{fontSize[0]} px</span></div>
                    <Slider aria-label="Subtitle size" min={25} max={48} value={fontSize} onValueChange={setFontSize} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span>Caption backdrop</span><span className="text-muted-foreground">{opacity[0]}%</span></div>
                    <Slider aria-label="Caption backdrop opacity" min={30} max={100} value={opacity} onValueChange={setOpacity} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span>Simulation pace</span><span className="text-muted-foreground">{pace[0] < 36 ? "Slow" : pace[0] > 72 ? "Fast" : "Real-time"}</span></div>
                    <Slider aria-label="Simulation pace" min={10} max={100} value={pace} onValueChange={setPace} />
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 pt-3">
                    <div>
                      <div className="text-xs font-medium">Original captions</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">Show above {targetLabel}</div>
                    </div>
                    <Switch aria-label="Show original captions" checked={bilingual} onCheckedChange={setBilingual} />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="export"
                  initial={{ opacity: 0, y: isMobile ? 24 : -10, scale: isMobile ? 1 : 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: isMobile ? 24 : -10, scale: isMobile ? 1 : 0.97 }}
                  transition={{ duration: 0.24, ease: EASE_OUT }}
                  className="float-panel export-panel"
                >
                  <div className="panel-title">Download transcript</div>
                  {([["txt", "Text document", FileText], ["srt", "Subtitle file", AudioLines], ["json", "JSON data", FileJson]] as const).map(
                    ([format, label, Icon]) => (
                      <motion.button
                        key={format}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => exportTranscript(format)}
                        disabled={transcript.length === 0}
                        className="export-option"
                      >
                        <Icon size={15} />
                        {label}
                        <span className="ml-auto text-[10px] uppercase text-muted-foreground">.{format}</span>
                      </motion.button>
                    ),
                  )}
                  <div className="panel-foot">{transcript.length} {transcript.length === 1 ? "caption" : "captions"}</div>
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>
      </header>

      <div id="studio" className="mx-auto grid w-full max-w-[1680px] grid-cols-1 lg:min-h-[calc(100vh-63px)] lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col border-border/60 lg:border-r">
          <div className="flex min-h-[54px] flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2 sm:px-7">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="mode-switch" role="group" aria-label="Captioning mode">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className={mode === "demo" ? "mode-choice selected" : "mode-choice"}
                  onClick={() => { if (running) stopStream(); setMode("demo"); setNotice(""); }}
                  aria-pressed={mode === "demo"}
                >
                  <Waves size={13} /> Demo
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className={mode === "mic" ? "mode-choice selected" : "mode-choice"}
                  onClick={() => { if (running) stopStream(); setMode("mic"); setNotice(""); }}
                  aria-pressed={mode === "mic"}
                >
                  <Mic size={13} /> Mic
                </motion.button>
              </div>
              {mode === "demo" ? (
                <Select value={preset} onValueChange={choosePreset}>
                  <SelectTrigger aria-label="Choose a demo conversation" className="h-9 w-[150px] border-border/60 bg-card/70 text-xs shadow-none backdrop-blur sm:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(presets).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="truncate text-[11px] text-muted-foreground">
                  {recognitionAvailable ? "Speech recognition ready" : "Browser speech recognition unavailable"}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
              <span className="language-chip">{languages.find((language) => language.value === sourceLanguage)?.native ?? sourceLanguage}</span>
              <span>→</span>
              <span className="language-chip">{languages.find((language) => language.value === targetLanguage)?.native ?? "English"}</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-3 py-4 sm:px-7 sm:py-6">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="stage glass-card relative flex min-h-[420px] flex-1 flex-col overflow-hidden sm:min-h-[500px]"
              style={{ "--subtitle-opacity": opacity[0] / 100 } as React.CSSProperties}
            >
              <div className="scan-line" aria-hidden="true" />
              <div className="absolute left-5 top-4 z-10 flex items-center gap-2 text-[10px] tracking-[1.6px] text-muted-foreground sm:left-7 sm:top-6">
                <span className="stage-square" />
                {presetInfo.category}
                <span className="mx-1 text-border">/</span>
                {mode === "demo" ? "TRANSLATION PREVIEW" : "LIVE TRANSCRIPTION"}
              </div>
              <div className="absolute right-5 top-4 z-10 flex items-center gap-2 font-mono text-[11px] text-muted-foreground sm:right-7 sm:top-6">
                <span className={`latency-chip ${running ? "is-live" : ""}`}>{running ? `~${paceInterval} MS` : "IDLE"}</span>
                {clock}
              </div>

              <div className="soundscape" aria-hidden="true">
                <div className={running ? "wave-grid is-moving" : "wave-grid"}>
                  {Array.from({ length: 66 }, (_, index) => (
                    <i key={index} style={{ "--bar-index": index } as React.CSSProperties} />
                  ))}
                </div>
                <div className="sound-axis" />
              </div>

              <div className="stage-caption" aria-live="polite" aria-atomic="true">
                <AnimatePresence mode="popLayout">
                  {currentOriginal || currentTranslation ? (
                    <motion.div
                      key={turn}
                      initial={{ opacity: 0, y: 26, scale: 0.985, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -34, scale: 0.98, filter: "blur(4px)" }}
                      transition={{ duration: 0.42, ease: EASE_OUT }}
                      className="caption-card"
                    >
                      {bilingual && currentOriginal && (
                        <p className="stage-original">
                          {currentOriginal}
                          <span className="caption-cursor" />
                        </p>
                      )}
                      <p className="stage-translation" style={{ fontSize: `clamp(24px, ${fontSize[0]}px, 54px)` }}>
                        {captionWords.map((word, wordIndex) => (
                          <motion.span
                            key={`${turn}-${wordIndex}`}
                            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            transition={{ duration: 0.26, delay: wordIndex * 0.035, ease: EASE_OUT }}
                            className="caption-word"
                          >
                            {word}{" "}
                          </motion.span>
                        ))}
                        <span className="caption-cursor" />
                      </p>
                      <span className="caption-tag"><span />LIVE CAPTION</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.35, ease: EASE_OUT }}
                      className="empty-stage"
                    >
                      <motion.div
                        className="empty-wave"
                        animate={running ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <AudioLines size={21} />
                      </motion.div>
                      <h1>{running ? "Listening" : "Ready when you are"}</h1>
                      <p>{running ? "The next words will appear here." : "Start a session to see your captions in real time."}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="absolute bottom-5 left-5 right-5 z-10 flex items-center justify-between sm:bottom-7 sm:left-7 sm:right-7">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
                  {mode === "demo" ? <Waves size={13} /> : <Mic size={13} />}
                  <span>{mode === "demo" ? "Audio simulation" : "Browser microphone"}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                  <span className="hidden sm:block">Caption clarity</span>
                  <span className="meter"><i /><i /><i /><i /><i /></span>
                  <span className={running ? "text-primary" : ""}>LIVE</span>
                </div>
              </div>
            </motion.div>

            <AnimatePresence>
              {notice && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.24, ease: EASE_OUT }}
                  className="notice-line"
                  role="status"
                >
                  <span>{notice}</span>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setNotice("")} aria-label="Dismiss message">
                    <X size={13} />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="control-strip mt-4 hidden items-center justify-between gap-4 border-y border-border/60 py-4 lg:flex">
              <div className="flex items-center gap-3">
                <div className="control-icon"><span className={running ? "control-dot active" : "control-dot"} /></div>
                <div>
                  <div className="text-xs font-medium">{running ? "Session live" : "Session paused"}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {mode === "demo" ? `${transcript.length} captions received` : recognitionAvailable ? "Microphone ready" : "Use a supported browser"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {startButton}
                {running && (
                  <Button variant="outline" size="icon" className="size-10 border-border/70" onClick={stopStream} aria-label="Stop session" title="Stop session">
                    <Square size={13} fill="currentColor" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {mode === "demo" && (
                  <div className="pace-control">
                    <span>PACE</span>
                    <Slider aria-label="Simulation pace" min={10} max={100} step={1} value={pace} onValueChange={setPace} className="w-[104px]" />
                    <span className="pace-label">{pace[0] < 36 ? "SLOW" : pace[0] > 72 ? "FAST" : "REALTIME"}</span>
                  </div>
                )}
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 border border-border/60 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={clearCanvas} title="Clear transcript">
                  <X size={13} /><span>Clear</span>
                </Button>
              </div>
            </div>

            <div className="mt-3 hidden flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground lg:flex">
              <div className="flex items-center gap-2">
                <Radio size={12} />
                <span>{mode === "demo" ? "SIMULATION · Streaming preview only" : "SPEECH RECOGNITION · Runs locally in your browser"}</span>
              </div>
              <span className="font-mono">{mode === "demo" ? `~${paceInterval} MS` : recognitionAvailable ? "LIVE" : "UNAVAILABLE"}</span>
            </div>
          </div>
        </section>

        {isMobile ? (
          <AnimatePresence>
            {historyOpen && (
              <>
                <button className="panel-overlay" onClick={() => setHistoryOpen(false)} aria-label="Close transcript" />
                <motion.aside
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", stiffness: 320, damping: 34 }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.4 }}
                  onDragEnd={(_, info) => { if (info.offset.y > 110) setHistoryOpen(false); }}
                  className="sheet-panel fixed inset-x-0 bottom-0 z-40 flex max-h-[76vh] flex-col rounded-t-2xl"
                >
                  <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden="true" />
                  <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-5">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-[13px] font-semibold">Live transcript</h2>
                      <span className="count-chip">{transcript.length.toString().padStart(2, "0")}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="header-button" onClick={() => setHistoryOpen(false)} aria-label="Close transcript">
                      <X size={16} />
                    </Button>
                  </div>
                  <div className="shrink-0 border-b border-border/60 p-4">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        aria-label="Search transcript"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Find a phrase…"
                        className="h-10 border-border/60 bg-card/60 pl-9 pr-9 text-sm"
                      />
                      {search && (
                        <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground" onClick={() => setSearch("")} aria-label="Clear search">
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  <TranscriptList
                    entries={filteredTranscript}
                    search={search}
                    clipboardId={clipboardId}
                    onCopy={copyCaption}
                  />
                  <div className="shrink-0 border-t border-border/60 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className={running ? "status-indicator active" : "status-indicator"} />
                        {running ? "Capturing captions" : "Waiting for a session"}
                      </span>
                      <span>{filteredTranscript.length} {filteredTranscript.length === 1 ? "entry" : "entries"}</span>
                    </div>
                    <Button variant="ghost" className="mt-3 h-9 w-full gap-2 border border-border/60 text-xs text-muted-foreground hover:text-foreground" disabled={transcript.length === 0} onClick={() => { setExportOpen(true); setHistoryOpen(false); }}>
                      <Download size={14} />Export transcript
                    </Button>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>
        ) : (
          <aside className="transcript-panel flex min-w-0 flex-col border-l border-border/60">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[13px] font-semibold">Live transcript</h2>
                <span className="count-chip">{transcript.length.toString().padStart(2, "0")}</span>
              </div>
              <Button variant="ghost" size="icon" className="header-button" onClick={() => setHistoryOpen((open) => !open)} aria-label={historyOpen ? "Collapse transcript" : "Expand transcript"}>
                <motion.span animate={{ rotate: historyOpen ? 0 : -90 }} transition={{ duration: 0.2 }}>
                  <ChevronDown size={16} />
                </motion.span>
              </Button>
            </div>
            {historyOpen ? (
              <>
                <div className="shrink-0 border-b border-border/60 p-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Search transcript"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a phrase…"
                      className="h-9 border-border/60 bg-card/60 pl-9 pr-9 text-xs"
                    />
                    {search && (
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground" onClick={() => setSearch("")} aria-label="Clear search">
                        <X size={13} />
                      </Button>
                    )}
                  </div>
                </div>
                <TranscriptList entries={filteredTranscript} search={search} clipboardId={clipboardId} onCopy={copyCaption} />
                <div className="shrink-0 border-t border-border/60 px-4 py-3">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className={running ? "status-indicator active" : "status-indicator"} />
                      {running ? "Capturing captions" : "Waiting for a session"}
                    </span>
                    <span>{filteredTranscript.length} {filteredTranscript.length === 1 ? "entry" : "entries"}</span>
                  </div>
                  <Button variant="ghost" className="mt-3 h-8 w-full gap-2 border border-border/60 text-[11px] text-muted-foreground hover:text-foreground" disabled={transcript.length === 0} onClick={() => setExportOpen(true)}>
                    <Download size={13} />Export transcript
                  </Button>
                </div>
              </>
            ) : (
              <button onClick={() => setHistoryOpen(true)} className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground hover:text-foreground">
                <span className="flex flex-col items-center gap-2"><ScrollText size={18} />Show transcript</span>
              </button>
            )}
          </aside>
        )}
      </div>

      <motion.div
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 26 }}
        className="dock fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-30 flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 lg:hidden"
      >
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="dock-button" onClick={clearCanvas} aria-label="Clear transcript" title="Clear transcript">
            <X size={17} />
          </Button>
          {mode === "demo" && (
            <div className="dock-pace">
              <span>PACE</span>
              <Slider aria-label="Simulation pace" min={10} max={100} value={pace} onValueChange={setPace} className="w-[74px]" />
            </div>
          )}
        </div>
        {startButton}
        {transcriptToggle}
      </motion.div>
    </main>
  );
}

function TranscriptList({
  entries,
  search,
  clipboardId,
  onCopy,
}: {
  entries: Caption[];
  search: string;
  clipboardId: number | null;
  onCopy: (caption: Caption) => void;
}) {
  return (
    <div className="transcript-list min-h-0 flex-1 overflow-y-auto px-4" aria-live="polite">
      {entries.length > 0 ? (
        <div className="divide-y divide-border/50">
          <AnimatePresence initial={false}>
            {entries.map((entry, index) => (
              <motion.article
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 16, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
                className="transcript-entry group py-4"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="entry-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{entry.time}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="copy-button"
                    onClick={() => onCopy(entry)}
                    aria-label={`Copy caption ${index + 1}`}
                    title="Copy caption"
                  >
                    {clipboardId === entry.id ? <Check size={13} /> : <Clipboard size={13} />}
                  </Button>
                </div>
                {entry.original && (
                  <p className="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{entry.original}</p>
                )}
                <p className="text-[13px] leading-[1.65]">{entry.translation}</p>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="transcript-empty">
          <div className="transcript-empty-icon"><FileText size={17} /></div>
          <p className="text-xs font-medium">{search ? "No matching captions" : "Nothing transcribed yet"}</p>
          <p className="mt-1.5 max-w-[220px] text-center text-[11px] leading-relaxed text-muted-foreground">
            {search ? "Try another word or phrase." : "Completed captions will appear here as your session runs."}
          </p>
        </div>
      )}
    </div>
  );
}
