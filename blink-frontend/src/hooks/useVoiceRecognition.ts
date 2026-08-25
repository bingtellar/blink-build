import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

// 🌟 THE GLOBAL FINTECH LEXICAL MAPPER
const DOMAIN_DICTIONARY: Record<string, string> = {
  // Radar (Copilot)
  "rita": "Radar",
  "reader": "Radar",
  "ryder": "Radar",
  "raider": "Radar",
  "redder": "Radar",
  "rada": "Radar",
  "rida": "Radar",
  "lada": "Radar",
  "wada": "Radar",
  "radar copilot": "Radar",

  "copilot": "Co-Pilot",
  "Co-Pilot": "Co-Pilot",

  // Blink (Core Brand)
  "blank": "Blink",
  "plink": "Blink",
  "blimp": "Blink",
  "brink": "Blink",
  "blinq": "Blink",
  "b-link": "Blink",
  "be link": "Blink",
  "b link": "Blink",

  // Stellar (Blockchain)
  "seller": "Stellar",
  "stella": "Stellar",
  "stealer": "Stellar",
  "stela": "Stellar",
  "steller": "Stellar",
  "styler": "Stellar",
  "cellar": "Stellar",

  // Soroban (Smart Contracts)
  "sorrow ban": "Soroban",
  "sarah ban": "Soroban",
  "saraban": "Soroban",
  "solo ban": "Soroban",
  "sora ban": "Soroban",
  "zoro ban": "Soroban",
  "so row ban": "Soroban",
  "sir roban": "Soroban",
  "sauron": "Soroban",

  // Currencies / Stablecoins
  "us dc": "USDC",
  "usd see": "USDC",
  "you as dc": "USDC",
  "use dc": "USDC",
  "us dt": "USDT",
  "usd tee": "USDT",
  "bitcoin": "Bitcoin",
  "bit coin": "Bitcoin",
  "big coin": "Bitcoin",

  // DeFi / Infrastructure Jargon
  "d5": "DeFi",
  "d fy": "DeFi",
  "defy": "DeFi",
  "def index": "DeFindex",
  "deaf index": "DeFindex",
  "blend capital": "Blend Capital",
  "blind capital": "Blend Capital",
  "freighter": "Freighter",
  "freight or": "Freighter",
  "frater": "Freighter"
};

// 🌟 ADVANCED REGEX PROCESSOR
const applyDomainCorrections = (text: string) => {
  let corrected = text;
  
  const sortedMistakes = Object.keys(DOMAIN_DICTIONARY).sort((a, b) => b.length - a.length);

  sortedMistakes.forEach((mistake) => {
    const regex = new RegExp(`\\b${mistake}\\b`, 'gi');
    corrected = corrected.replace(regex, DOMAIN_DICTIONARY[mistake]);
  });
  
  if (corrected.length > 0) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  }
  
  return corrected;
};

// 🌟 PHONETIC EMAIL & ADDRESS REPAIR ENGINE
const normalizeVoiceEntities = (rawText: string): string => {
  let text = rawText;

  text = text.replace(/(\w+)\s+(?:at|@)\s+(\w+)\s+(?:dot|\.)\s+([a-zA-Z]{2,})/gi, '$1@$2.$3');
  text = text.replace(/([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+)\s*\.\s*([a-zA-Z]{2,})/gi, '$1@$2.$3');
  text = text.replace(/@g\s*mail/gi, '@gmail');
  text = text.replace(/@yahoo\s*dot\s*com/gi, '@yahoo.com');
  text = text.replace(/@outlook\s*dot\s*com/gi, '@outlook.com');

  return text;
};

export const useVoiceRecognition = () => {
  const activeAccount = useStore((state: any) => state.activeAccount);
  const [isListening, setIsListening] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [downloadProgress] = useState<number | null>(null); 
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Native Web Speech API references
  const recognitionRef = useRef<any>(null);
  const intendedToListenRef = useRef<boolean>(false);
  const isNativeSupportedRef = useRef<boolean>(false);

  // Fallback MediaRecorder references (Firefox support)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // 🌟 THE IOS/SAFARI BYPASS FIX: 
    // Apple exposes webkitSpeechRecognition, but it is notoriously buggy and crashes.
    // We force iOS, iPadOS, and Safari to use our bulletproof MediaRecorder backend pipeline.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const forceFallback = isIOS || isSafari;

    const SpeechRecognition = !forceFallback ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

    if (SpeechRecognition) {
      isNativeSupportedRef.current = true;
      setIsSupported(true);

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true; 

      recognition.onstart = () => {
        setIsListening(true);
        setIsProcessingVoice(false);
        setErrorMessage(null);
      };

      recognition.onresult = (event: any) => {
        let currentText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        
        const domainCorrected = applyDomainCorrections(currentText);
        const finalCleaned = normalizeVoiceEntities(domainCorrected);
        
        setTranscript(finalCleaned);
      };

      recognition.onerror = (event: any) => {
        console.warn("[Native Voice] Error:", event.error);
        
        if (event.error === "no-speech") return; 

        if (event.error === "not-allowed") {
          setErrorMessage("Microphone access blocked. Please enable it in browser settings.");
        } else {
          setErrorMessage("Voice recognition error. Please try again.");
        }
        
        intendedToListenRef.current = false;
        setIsListening(false);
        setIsProcessingVoice(false);
      };

      recognition.onend = () => {
        if (intendedToListenRef.current) {
          try {
            recognition.start();
          } catch (e) {
            intendedToListenRef.current = false;
            setIsListening(false);
          }
        } else {
          setIsListening(false);
          setIsProcessingVoice(false);
        }
      };

      recognitionRef.current = recognition;
    } else if (navigator.mediaDevices && typeof MediaRecorder !== "undefined") {
      // 🌟 FIREFOX HYBRID FALLBACK
      isNativeSupportedRef.current = false;
      setIsSupported(true);
    } else {
      setIsSupported(false);
    }

    return () => {
      intendedToListenRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startListening = useCallback(async () => {
    setTranscript("");
    setErrorMessage(null);
    setIsProcessingVoice(false);

    // 1. Native Web Speech Path (Chrome, Safari, Edge)
    if (isNativeSupportedRef.current && recognitionRef.current) {
      intendedToListenRef.current = true; 
      try {
        recognitionRef.current.start();
      } catch (err) {
        recognitionRef.current.stop();
        setTimeout(() => {
          if (intendedToListenRef.current) recognitionRef.current.start();
        }, 100);
      }
      return;
    }

    // 2. MediaRecorder Fallback Path (Firefox - Studio DSP Enhanced)
    try {
      // 🎙️ HARDWARE AUDIO DSP OPTIMIZATION
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true, // Automatically boosts quiet voice input
          channelCount: 1,       // Mono channel provides cleaner vocal isolation
          sampleRate: 48000
        }
      });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      // 🌟 IOS MIME TYPE FIX: iOS Safari ONLY supports audio/mp4 for MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "";

      // Enforce 128kbps high-fidelity bitrate
      const options: MediaRecorderOptions = {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 128000
      };

      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessingVoice(true);
        
        // 🌟 IOS EXTENSION FIX: Match the blob type to the supported mimeType
        const finalMimeType = mimeType || "audio/mp4";
        const fileExtension = finalMimeType.includes("mp4") ? "mp4" : "webm";

        const recordedBlob = new Blob(audioChunksRef.current, {
          type: finalMimeType,
        });

        if (recordedBlob.size > 0) {
          const targetUserId = activeAccount?.id || "me";
          const formData = new FormData();
          formData.append("file", recordedBlob, `recording.${fileExtension}`);

          try {
            const res = await api.post(`/users/${targetUserId}/stt`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });

            if (res.data?.transcript) {
              const domainCorrected = applyDomainCorrections(res.data.transcript);
              const finalCleaned = normalizeVoiceEntities(domainCorrected);
              setTranscript(finalCleaned);
            }
          } catch (err) {
            console.error("[Fallback STT Error]:", err);
            setErrorMessage("Failed to transcribe voice recording.");
          }
        }

        setIsProcessingVoice(false);
        setIsListening(false);

        // Turn off the hardware microphone indicator
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch (err: any) {
      console.error("[MediaRecorder Error]:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("Microphone access blocked. Please enable it in browser settings.");
      } else {
        setErrorMessage("Could not access microphone.");
      }
      setIsListening(false);
      setIsProcessingVoice(false);
    }
  }, [activeAccount?.id]);

  const stopListening = useCallback(() => {
    // 1. Native Web Speech Path
    if (isNativeSupportedRef.current && recognitionRef.current) {
      intendedToListenRef.current = false; 
      setIsProcessingVoice(true);
      recognitionRef.current.stop();
      
      setTimeout(() => {
        setIsProcessingVoice(false);
      }, 400);
      return;
    }

    // 2. MediaRecorder Fallback Path
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening: isListening || isProcessingVoice,
    isProcessingVoice,
    downloadProgress,
    transcript,
    setTranscript,
    isSupported,
    errorMessage,
    startListening,
    stopListening,
    toggleListening,
  };
};