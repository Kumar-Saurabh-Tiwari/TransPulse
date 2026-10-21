import { createFileRoute } from "@tanstack/react-router";
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
  Headphones,
  Languages,
  Mic,
  Pause,
  Play,
  Radio,
  Search,
  Settings2,
  Square,
  Waves,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { hasAudioLevel, hasSpeechActivity } from "@/lib/audio-activity";
import { translateCaption } from "@/lib/translate-caption";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TransPulse — Live captions, in the moment" },
      {
        name: "description",
        content: "A live-captioning studio with a streaming demo, microphone transcription, and searchable transcript exports.",
      },
      { property: "og:title", content: "TransPulse — Live captions, in the moment" },
      {
        property: "og:description",
        content: "A live-captioning studio with a streaming demo, microphone transcription, and searchable transcript exports.",
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
  { value: "auto", label: "Auto detect", native: "Auto" },
  { value: "ja-JP", label: "Japanese", native: "日本語" },
  { value: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { value: "es-ES", label: "Spanish", native: "Español" },
  { value: "de-DE", label: "German", native: "Deutsch" },
  { value: "fr-FR", label: "French", native: "Français" },
  { value: "ko-KR", label: "Korean", native: "한국어" },
  { value: "en-US", label: "English", native: "English" },
];
const targetLanguages = languages.filter((language) => language.value !== "auto");
const detectedLanguageCodes: Record<string, string> = {
  en: "en",
  english: "en",
  ja: "ja",
  japanese: "ja",
  hi: "hi",
  hindi: "hi",
  es: "es",
  spanish: "es",
  de: "de",
  german: "de",
  fr: "fr",
  french: "fr",
  ko: "ko",
  korean: "ko",
};

const presets: Record<string, { title: string; category: string; language: string; lines: Utterance[] }> = {
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

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

function TransPulse() {
  const [mode, setMode] = useState<"demo" | "mic">("mic");
  const [preset, setPreset] = useState("keynote");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en-US");
  const [running, setRunning] = useState(false);
  const [bilingual, setBilingual] = useState(true);
  const [fontSize, setFontSize] = useState([48]);
  const [opacity, setOpacity] = useState([94]);
  const [pace, setPace] = useState([48]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [transcript, setTranscript] = useState<Caption[]>([]);
  const [currentOriginal, setCurrentOriginal] = useState("");
  const [currentTranslation, setCurrentTranslation] = useState("");
  const [showOriginal, setShowOriginal] = useState(true);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState("00:00:00");
  const [speakerCount, setSpeakerCount] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [clipboardId, setClipboardId] = useState<number | null>(null);
  const [microphoneAvailable, setMicrophoneAvailable] = useState(false);
  const presetRef = useRef(preset);
  const runningRef = useRef(false);
  const indexRef = useRef(0);
  const wordTimerRef = useRef<number | undefined>(undefined);
  const sentenceTimerRef = useRef<number | undefined>(undefined);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioSegmentTimerRef = useRef<number | undefined>(undefined);
  const audioLevelTimerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioSamplesRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const speechActivityMsRef = useRef(0);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionGenerationRef = useRef(0);
  const captionIdRef = useRef(0);
  const sessionStartedAtRef = useRef<number | null>(null);
  const translationLabel = useMemo(
    () => languages.find((language) => language.value === targetLanguage)?.label ?? "English",
    [targetLanguage],
  );

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMicrophoneAvailable(
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof window.MediaRecorder === "function" &&
        typeof window.AudioContext === "function",
    );
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const startedAt = sessionStartedAtRef.current ?? Date.now();
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      setClock(
        [hours, minutes, seconds]
          .map((value) => String(value).padStart(2, "0"))
          .join(":"),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const finishCaption = useCallback((original: string, translation: string) => {
    if (!original.trim() && !translation.trim()) return;
    const caption: Caption = {
      id: ++captionIdRef.current,
      original: original.trim(),
      translation: translation.trim() || original.trim(),
      time: formatTime(new Date()),
    };
    setTranscript((previous) => [...previous, caption]);
    setCurrentOriginal("");
    setCurrentTranslation("");
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
      const originalProgress = Math.max(1, Math.ceil((position / translatedWords.length) * originalWords.length));
      setCurrentOriginal(originalWords.slice(0, Math.min(originalProgress, originalWords.length)).join(" "));
      setCurrentTranslation(translatedWords.slice(0, Math.min(position, translatedWords.length)).join(" "));
      if (position < translatedWords.length) {
        const interval = Math.max(95, 305 - pace[0] * 2.1);
        wordTimerRef.current = window.setTimeout(tick, interval);
      } else {
        sentenceTimerRef.current = window.setTimeout(() => {
          if (!runningRef.current) return;
          finishCaption(utterance.original, utterance.translation);
          sentenceTimerRef.current = window.setTimeout(speakNext, 650);
        }, 1100);
      }
    };
    wordTimerRef.current = window.setTimeout(tick, 280);
  }, [finishCaption, pace]);

  useEffect(() => {
    return () => {
      if (wordTimerRef.current) window.clearTimeout(wordTimerRef.current);
      if (sentenceTimerRef.current) window.clearTimeout(sentenceTimerRef.current);
      if (audioLevelTimerRef.current) window.clearInterval(audioLevelTimerRef.current);
      audioRecorderRef.current?.stop();
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, []);

  const stopStream = useCallback(() => {
    sessionGenerationRef.current += 1;
    runningRef.current = false;
    setRunning(false);
    if (wordTimerRef.current) window.clearTimeout(wordTimerRef.current);
    if (sentenceTimerRef.current) window.clearTimeout(sentenceTimerRef.current);
    if (audioSegmentTimerRef.current) window.clearTimeout(audioSegmentTimerRef.current);
    if (audioLevelTimerRef.current) window.clearInterval(audioLevelTimerRef.current);
    if (audioRecorderRef.current?.state === "recording") {
      audioRecorderRef.current.stop();
    }
    audioRecorderRef.current = null;
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    audioAnalyserRef.current = null;
    audioSamplesRef.current = null;
    speechActivityMsRef.current = 0;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    if (mode === "demo" && (currentOriginal || currentTranslation)) {
      finishCaption(currentOriginal, currentTranslation);
    }
  }, [currentOriginal, currentTranslation, finishCaption, mode]);

  const enqueueTranscription = useCallback((audio: Blob, sessionGeneration: number) => {
    const transcription = transcriptionQueueRef.current.then(async () => {
      if (sessionGeneration !== sessionGenerationRef.current) return;
      const formData = new FormData();
      formData.append("file", audio, `recording.${audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm"}`);
      if (sourceLanguage !== "auto") {
        formData.append("language", sourceLanguage.split("-")[0] ?? sourceLanguage);
      }
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The transcription service could not process this audio.";
        throw new Error(message);
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("text" in payload) ||
        typeof payload.text !== "string"
      ) {
        throw new Error("The transcription service returned an invalid response.");
      }

      const original = payload.text.trim();
      if (sessionGeneration !== sessionGenerationRef.current) return;
      if (!original) {
        setNotice("No speech detected yet. Keep the other phone close to the microphone.");
        return;
      }

      let translation = original;
      const detectedLanguage =
        "language" in payload && typeof payload.language === "string"
          ? detectedLanguageCodes[payload.language.trim().toLowerCase()]
          : undefined;
      const languageForTranslation = sourceLanguage === "auto" ? detectedLanguage : sourceLanguage;
      if (languageForTranslation) {
        try {
          translation = await translateCaption(original, languageForTranslation, targetLanguage);
        } catch {
          setNotice("Speech was transcribed, but translation failed. Check your internet connection.");
          translation = "Translation unavailable";
        }
      } else {
        setNotice("Speech was transcribed, but its language could not be detected for translation.");
      }
      if (sessionGeneration !== sessionGenerationRef.current) return;

      const caption: Caption = {
        id: ++captionIdRef.current,
        original,
        translation,
        time: formatTime(new Date()),
      };
      setTranscript((previous) => [...previous, caption]);
      setCurrentOriginal(original);
      setCurrentTranslation(translation);
      setNotice("");
    });

    transcriptionQueueRef.current = transcription.catch((error: unknown) => {
      if (sessionGeneration !== sessionGenerationRef.current) return;
      setNotice(error instanceof Error ? error.message : "Audio transcription failed. Check your connection and try again.");
      stopStream();
    });
  }, [sourceLanguage, stopStream, targetLanguage]);

  const startStream = useCallback(async () => {
    if (runningRef.current) {
      stopStream();
      return;
    }
    if (mode === "mic") {
      if (!microphoneAvailable) {
        setNotice("Microphone recording is not supported by this browser. Try a current version of Chrome, Edge, or Safari.");
        return;
      }
      setNotice("");
      const sessionGeneration = ++sessionGenerationRef.current;
      runningRef.current = true;
      sessionStartedAtRef.current = Date.now();
      setRunning(true);
      setClock("00:00:00");
      setCurrentOriginal("Waiting for speech…");
      setCurrentTranslation("Captions update about every 10 seconds when speech is detected.");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        if (sessionGeneration !== sessionGenerationRef.current || !runningRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        audioStreamRef.current = stream;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        await audioContext.resume();
        if (sessionGeneration !== sessionGenerationRef.current || !runningRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          void audioContext.close();
          return;
        }
        audioAnalyserRef.current = analyser;
        audioSamplesRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize));
        audioLevelTimerRef.current = window.setInterval(() => {
          const activeAnalyser = audioAnalyserRef.current;
          const samples = audioSamplesRef.current;
          if (!activeAnalyser || !samples) return;
          activeAnalyser.getFloatTimeDomainData(samples);
          if (hasAudioLevel(samples)) speechActivityMsRef.current += 100;
        }, 100);

        const startSegment = () => {
          if (sessionGeneration !== sessionGenerationRef.current || !runningRef.current) return;
          try {
            const supportedMimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
              .find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = supportedMimeType
              ? new MediaRecorder(stream, { mimeType: supportedMimeType })
              : new MediaRecorder(stream);
            const chunks: Blob[] = [];
            audioRecorderRef.current = recorder;
            recorder.ondataavailable = (event) => {
              if (event.data.size > 0) chunks.push(event.data);
            };
            recorder.onerror = () => {
              setNotice("Microphone recording failed. Check microphone permission and try again.");
              stopStream();
            };
            recorder.onstop = () => {
              if (audioRecorderRef.current === recorder) audioRecorderRef.current = null;
              const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/webm" });
              const hadSpeech = hasSpeechActivity(speechActivityMsRef.current);
              speechActivityMsRef.current = 0;
              if (audioSegmentTimerRef.current) window.clearTimeout(audioSegmentTimerRef.current);
              if (audio.size > 0 && hadSpeech) enqueueTranscription(audio, sessionGeneration);
              if (sessionGeneration === sessionGenerationRef.current && runningRef.current) startSegment();
            };
            recorder.start();
            audioSegmentTimerRef.current = window.setTimeout(() => {
              if (recorder.state === "recording") recorder.stop();
            }, 10_000);
          } catch {
            setNotice("Could not record microphone audio. Check your browser and microphone settings.");
            stopStream();
          }
        };

        startSegment();
      } catch (error) {
        runningRef.current = false;
        setRunning(false);
        if (audioLevelTimerRef.current) window.clearInterval(audioLevelTimerRef.current);
        audioLevelTimerRef.current = undefined;
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        audioAnalyserRef.current = null;
        audioSamplesRef.current = null;
        void audioContextRef.current?.close();
        audioContextRef.current = null;
        setCurrentOriginal("");
        setCurrentTranslation("");
        setNotice(error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access in your browser settings, then try again."
          : "Could not access the microphone. Check that it is connected and use a secure connection.");
      }
      return;
    }
    setNotice("");
    indexRef.current = 0;
    setClock("00:00:00");
    runningRef.current = true;
    sessionGenerationRef.current += 1;
    sessionStartedAtRef.current = Date.now();
    setRunning(true);
    speakNext();
  }, [enqueueTranscription, microphoneAvailable, mode, speakNext, stopStream]);

  const choosePreset = (value: string) => {
    stopStream();
    setMode("demo");
    setPreset(value);
    setSourceLanguage(presets[value]?.language ?? "ja-JP");
    setCurrentOriginal("");
    setCurrentTranslation("");
    setTranscript([]);
    setClock("00:00:00");
  };

  const filteredTranscript = transcript.filter((entry) =>
    `${entry.original} ${entry.translation}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );

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
      window.setTimeout(() => setClipboardId((previous) => previous === caption.id ? null : previous), 1400);
    } catch {
      setNotice("Could not copy the caption. Check clipboard permission in your browser.");
    }
  };

  const exportTranscript = (format: "txt" | "json" | "srt") => {
    const content = format === "json"
      ? JSON.stringify(transcript.map(({ original, translation, time }) => ({ time, original, translation })), null, 2)
      : format === "srt"
        ? transcript.map((entry, index) => {
            const seconds = index * 4;
            const stamp = (value: number) => `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(Math.floor((value % 3600) / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")},000`;
            return `${index + 1}\n${stamp(seconds)} --> ${stamp(seconds + 4)}\n${entry.original}\n${entry.translation}`;
          }).join("\n\n")
        : transcript.map((entry) => `[${entry.time}]\n${entry.original}\n${entry.translation}`).join("\n\n");
    const mimeType = format === "json" ? "application/json" : format === "srt" ? "text/srt" : "text/plain";
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

  return (
    <main className="studio min-h-screen bg-background text-foreground">
      <header className="studio-header sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-[66px] w-full max-w-[1680px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#studio" className="flex shrink-0 items-center gap-2.5" aria-label="TransPulse home">
            <span className="brand-mark"><Activity size={19} strokeWidth={2.4} /></span>
            <span className="font-display text-[18px] font-bold tracking-[0.3px]">TransPulse<span className="brand-dot">.</span></span>
          </a>
          <div className="hidden min-w-0 items-center gap-2 text-[12px] text-muted-foreground md:flex">
            <span className={running ? "status-indicator active" : "status-indicator"} />
            <span className={running ? "text-foreground" : ""}>{running ? "ON AIR" : "STANDBY"}</span>
            <span className="mx-1 text-border">/</span>
            <span className="truncate">{mode === "demo" ? "Simulation studio" : "Microphone studio"}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1.5 sm:flex">
              <Languages size={15} className="text-primary" />
              <Select value={sourceLanguage} onValueChange={setSourceLanguage} disabled={running}>
                <SelectTrigger aria-label="Source language" className="h-8 w-[126px] border-transparent bg-secondary/60 text-xs shadow-none"><SelectValue /></SelectTrigger>
                <SelectContent>{languages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">→</span>
              <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={running}>
                <SelectTrigger aria-label="Caption language" className="h-8 w-[126px] border-transparent bg-secondary/60 text-xs shadow-none"><SelectValue /></SelectTrigger>
                <SelectContent>{targetLanguages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="size-9" aria-label="Subtitle settings" title="Subtitle settings" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={17} /></Button>
            <Button variant="outline" size="sm" className="h-9 gap-2 px-3" onClick={() => { setExportOpen((open) => !open); setHistoryOpen(true); }}>
              <Download size={15} /><span className="hidden sm:inline">Export</span><ChevronDown size={13} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2 sm:hidden">
          <Select value={sourceLanguage} onValueChange={setSourceLanguage} disabled={running}><SelectTrigger aria-label="Source language" className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger><SelectContent>{languages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent></Select>
          <span className="text-muted-foreground">→</span>
          <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={running}><SelectTrigger aria-label="Caption language" className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger><SelectContent>{targetLanguages.map((language) => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent></Select>
        </div>
        {exportOpen && <div className="absolute right-4 top-[60px] z-50 w-52 border border-border bg-popover p-1.5 shadow-lg sm:right-8">
          <div className="px-2.5 py-2 text-[10px] uppercase tracking-[1.5px] text-muted-foreground">Download transcript</div>
          {([ ["txt", "Text document", FileText], ["srt", "Subtitle file", AudioLines], ["json", "JSON data", FileJson] ] as const).map(([format, label, Icon]) => <button key={format} onClick={() => exportTranscript(format)} disabled={transcript.length === 0} className="flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"><Icon size={15} />{label}<span className="ml-auto text-[10px] uppercase text-muted-foreground">.{format}</span></button>)}
          <div className="border-t border-border px-2.5 py-2 text-[10px] text-muted-foreground">{transcript.length} {transcript.length === 1 ? "caption" : "captions"}</div>
        </div>}
      </header>

      <div id="studio" className="mx-auto grid w-full max-w-[1680px] grid-cols-1 lg:min-h-[calc(100vh-67px)] lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="flex min-w-0 flex-col border-border lg:border-r">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <div className="mode-switch" aria-label="Captioning mode">
                <button className={mode === "demo" ? "mode-choice selected" : "mode-choice"} onClick={() => { if (running) stopStream(); setMode("demo"); setNotice(""); }} aria-pressed={mode === "demo"}><Waves size={14} />Demo</button>
                <button className={mode === "mic" ? "mode-choice selected" : "mode-choice"} onClick={() => { if (running) stopStream(); setMode("mic"); setNotice(""); }} aria-pressed={mode === "mic"}><Mic size={14} />Mic</button>
              </div>
              {mode === "demo" ? <Select value={preset} onValueChange={choosePreset}>
                <SelectTrigger aria-label="Choose a demo conversation" className="h-9 w-[168px] border-transparent bg-transparent text-xs shadow-none sm:w-[225px]"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(presets).map(([key, value]) => <SelectItem key={key} value={key}>{value.title}</SelectItem>)}</SelectContent>
              </Select> : <span className="truncate text-xs text-muted-foreground">{microphoneAvailable ? "Multilingual transcription ready" : "Microphone recording unavailable"}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span className="hidden sm:inline">SOURCE</span><span className="language-chip">{languages.find((language) => language.value === sourceLanguage)?.native ?? sourceLanguage}</span>
              <span className="text-border">→</span><span className="language-chip">{languages.find((language) => language.value === targetLanguage)?.native ?? "English"}</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-4 py-5 sm:px-7 sm:py-7">
            <div className="stage relative flex min-h-[390px] flex-1 flex-col overflow-hidden border border-border sm:min-h-[480px]" style={{ "--subtitle-opacity": opacity[0] / 100 } as React.CSSProperties}>
              <div className="scan-line" aria-hidden="true" />
              <div className="absolute left-5 top-4 z-10 flex items-center gap-2 text-[10px] tracking-[1.7px] text-muted-foreground sm:left-7 sm:top-6"><span className="stage-square" />{mode === "demo" ? presetInfo.category : "LIVE SESSION"}<span className="mx-1 text-border">/</span>{mode === "demo" ? "TRANSLATION PREVIEW" : "LIVE TRANSLATION"}</div>
              <div className="absolute right-5 top-4 z-10 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground sm:right-7 sm:top-6"><span className="size-1.5 rounded-full bg-primary" />{clock}</div>

              <div className={`soundscape${running ? " is-live" : ""}`} aria-hidden="true">
                <svg className="ecg-trace" viewBox="0 0 720 100" preserveAspectRatio="none">
                  <path d="M0 50h112l12-2 10 2h35l12-3 12 3h34l12-2 10 2h27l9-5 10 10 12-24 14 39 13-20 10 3h35l12-2 10 2h35l12-3 12 3h34l12-2 10 2h27l9-5 10 10 12-24 14 39 13-20 10 3h35l12-2 10 2h35l12-3 12 3h34l12-2 10 2h27l9-5 10 10 12-24 14 39 13-20 10 3h35l12-2 10 2h40" />
                </svg>
                <div className={running ? "wave-grid is-moving" : "wave-grid"}>{Array.from({ length: 66 }, (_, index) => <i key={index} style={{ "--bar-index": index } as React.CSSProperties} />)}</div><div className="sound-axis" />
              </div>
              <div className="stage-caption" aria-live="polite" aria-atomic="true">
                {currentOriginal || currentTranslation ? <div key={`${preset}-${currentTranslation}`} className="caption-enter">
                  {bilingual && showOriginal && currentOriginal && <p className="stage-original">{currentOriginal}<span className="caption-cursor" /></p>}
                  <p className="stage-translation" style={{ fontSize: `clamp(30px, ${fontSize[0]}px, 72px)` }}>{currentTranslation || currentOriginal}<span className="caption-cursor" /></p>
                  <span className="caption-tag"><span />LIVE {translationLabel.toUpperCase()} TRANSLATION</span>
                </div> : <div className="empty-stage"><div className="empty-wave"><AudioLines size={22} /></div><h1>{running ? "Listening" : "Ready when you are"}</h1><p>{running ? "The next words will appear here." : "Start a session to see your captions in real time."}</p></div>}
              </div>
              <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between sm:bottom-7 sm:left-7 sm:right-7"><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[1.2px] text-muted-foreground"><Headphones size={13} /><span>{mode === "demo" ? "Audio simulation" : "Browser microphone"}</span></div><div className="flex items-center gap-3 text-[10px] text-muted-foreground"><span className="hidden sm:block">Caption clarity</span><span className="meter"><i /><i /><i /><i /><i /></span><span>LIVE</span></div></div>
            </div>

            {notice && <div className="notice-line" role="status"><span>{notice}</span><Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={13} /></Button></div>}

            <div className="control-strip mt-4 grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3">
              <div className="flex items-center gap-3 sm:justify-self-start">
                <div className="control-icon"><span className={running ? "control-dot active" : "control-dot"} /></div>
                <div><div className="text-xs font-medium">{running ? "Session live" : "Session paused"}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{mode === "demo" ? `${transcript.length} captions received` : microphoneAvailable ? "Microphone ready" : "Use a supported browser"}</div></div>
              </div>
              <div className="flex items-center gap-2 sm:justify-self-center">
                <Button onClick={startStream} className={running ? "h-10 min-w-[164px] gap-2 px-5" : "h-10 min-w-[164px] gap-2 px-5 primary-glow"} disabled={mode === "mic" && !microphoneAvailable}>
                  {running ? <><Pause size={15} />Pause session</> : mode === "mic" ? <><Mic size={15} />Start microphone</> : <><Play size={15} fill="currentColor" />Start session</>}
                </Button>
                {running && <Button variant="outline" size="icon" className="size-10" onClick={stopStream} aria-label="Stop session" title="Stop session"><Square size={14} fill="currentColor" /></Button>}
              </div>
              <div className="flex items-center gap-3 sm:justify-self-end">
                {mode === "demo" && <div className="pace-control"><span>PACE</span><Slider aria-label="Simulation pace" min={10} max={100} step={1} value={pace} onValueChange={setPace} className="w-[104px]" /><span className="pace-label">{pace[0] < 36 ? "SLOW" : pace[0] > 72 ? "FAST" : "REALTIME"}</span></div>}
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={clearCanvas} title="Clear transcript"><X size={14} /><span>Clear</span></Button>
              </div>
            </div>

            {settingsOpen && <div className="settings-panel grid grid-cols-1 gap-5 border-b border-border py-5 sm:grid-cols-3">
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Subtitle size</span><span className="text-muted-foreground">{fontSize[0]} px</span></div><Slider aria-label="Subtitle size" min={30} max={64} value={fontSize} onValueChange={setFontSize} /></div>
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Caption backdrop</span><span className="text-muted-foreground">{opacity[0]}%</span></div><Slider aria-label="Caption backdrop opacity" min={30} max={100} value={opacity} onValueChange={setOpacity} /></div>
              <div className="flex items-center justify-between"><div><div className="text-xs font-medium">Original captions</div><div className="mt-1 text-[10px] text-muted-foreground">Show above {translationLabel}</div></div><Switch aria-label="Show original captions" checked={bilingual} onCheckedChange={setBilingual} /></div>
            </div>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-[10px] text-muted-foreground"><div className="flex items-center gap-2"><Radio size={13} /><span>{mode === "demo" ? "SIMULATION" : "SPEECH + TRANSLATION"}</span><span className="text-border">·</span><span>{mode === "demo" ? "Streaming preview only" : "Audio transcription and translation use online services"}</span></div><span className="font-mono">{mode === "demo" ? "~120 MS" : microphoneAvailable ? "LIVE" : "UNAVAILABLE"}</span></div>
          </div>
        </section>

        <aside className={historyOpen ? "transcript-panel flex min-h-[500px] min-w-0 flex-col lg:min-h-0" : "transcript-panel flex min-w-0 flex-col"}>
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
            <div className="flex items-center gap-2.5"><h2 className="text-[13px] font-semibold">Live transcript</h2><span className="count-chip">{transcript.length.toString().padStart(2, "0")}</span></div>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => setHistoryOpen((open) => !open)} aria-label={historyOpen ? "Collapse transcript" : "Expand transcript"}><ChevronDown size={16} className={historyOpen ? "rotate-0" : "-rotate-90"} /></Button>
          </div>
          {historyOpen && <>
            <div className="border-b border-border p-4">
              <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search transcript" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a phrase…" className="h-9 border-border/80 pl-9 pr-8 text-xs" />{search && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground" onClick={() => setSearch("")} aria-label="Clear search"><X size={13} /></Button>}</div>
            </div>
            <div className="transcript-list min-h-0 flex-1 overflow-y-auto px-4" aria-live="polite">
              {filteredTranscript.length > 0 ? <div className="divide-y divide-border/70">{filteredTranscript.map((entry, index) => <article key={entry.id} className="transcript-entry group py-4"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><span className="entry-index">{String(index + 1).padStart(2, "0")}</span><span className="font-mono text-[10px] text-muted-foreground">{entry.time}</span></div><Button variant="ghost" size="icon" className="size-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" onClick={() => void copyCaption(entry)} aria-label={`Copy caption ${index + 1}`} title="Copy caption">{clipboardId === entry.id ? <Check size={13} /> : <Clipboard size={13} />}</Button></div>{entry.original && <p className="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{entry.original}</p>}<p className="text-[13px] leading-[1.65]">{entry.translation}</p></article>)}</div> : <div className="transcript-empty"><div className="transcript-empty-icon"><FileText size={17} /></div><p className="text-xs font-medium">{search ? "No matching captions" : "Nothing transcribed yet"}</p><p className="mt-1.5 max-w-[215px] text-center text-[11px] leading-relaxed text-muted-foreground">{search ? "Try another word or phrase." : "Completed captions will appear here as your session runs."}</p></div>}
            </div>
            <div className="border-t border-border px-4 py-3"><div className="flex items-center justify-between text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className={running ? "status-indicator active" : "status-indicator"} />{running ? "Capturing captions" : "Waiting for a session"}</span><span>{filteredTranscript.length} {filteredTranscript.length === 1 ? "entry" : "entries"}</span></div><Button variant="ghost" className="mt-3 h-8 w-full gap-2 border border-border/70 text-[11px] text-muted-foreground hover:text-foreground" disabled={transcript.length === 0} onClick={() => { setExportOpen(true); }}><Download size={13} />Export transcript</Button></div>
          </>}
        </aside>
      </div>
    </main>
  );
}