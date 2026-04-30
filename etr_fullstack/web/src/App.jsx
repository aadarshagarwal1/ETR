import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import isteLogo from "@/assets/iste_logo.png";
import triveniLogo from "@/assets/triveni_logo.png";

const PREDICT_ENDPOINT = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TARS_MAP = {
  idle: [
    {
      tag: "TARS",
      tone: "tars",
      text: "Operator present. Optical bay holding at passive acquisition.",
    },
    { tag: "SCAN", tone: "scan", text: "Frame sequencer armed. Awaiting manual scan command." },
    { tag: "TARS", tone: "tars", text: "Triveni chamber telemetry routed through local console." },
    { tag: "SCAN", tone: "scan", text: "Target datum centered. Square crop buffer standing by." },
  ],
  scanning: [
    {
      tag: "SCAN",
      tone: "scan",
      text: "Vertical sweep engaged. Five second exposure window open.",
    },
    {
      tag: "TARS",
      tone: "tars",
      text: "Keep subject inside etched boundary. Do not translate frame.",
    },
    {
      tag: "WARN",
      tone: "warn",
      text: "Active illumination. Glare rejection reduced until sweep completes.",
    },
    { tag: "SCAN", tone: "scan", text: "CMOS buffer sampling. Laser bar crossing central datum." },
  ],
  transmitting: [
    { tag: "SCAN", tone: "scan", text: "Exposure sealed. Encoding frame for backend classifier." },
    { tag: "TARS", tone: "tars", text: "Packet uplink opened to local prediction service." },
    { tag: "SCAN", tone: "scan", text: "Awaiting response from chamber compute node." },
  ],
  complete: [
    {
      tag: "SCAN",
      tone: "scan",
      text: "Classifier telemetry received. Result latched to mission clock.",
    },
    {
      tag: "TARS",
      tone: "tars",
      text: "Optical bay returned to passive watch. Next scan authorized.",
    },
    { tag: "SCAN", tone: "scan", text: "Frame buffer cleared. Scan archive marker committed." },
  ],
  error: [
    { tag: "WARN", tone: "warn", text: "Prediction uplink rejected, blocked, or unavailable." },
    {
      tag: "TARS",
      tone: "tars",
      text: "Verify Python service at localhost:5000 and repeat acquisition.",
    },
    {
      tag: "WARN",
      tone: "warn",
      text: "No classification written. Console remains in safe optical mode.",
    },
  ],
};

const gauges = [
  { label: "OPTICS", value: "LIVE", detail: "CMOS BAY", level: 91 },
  { label: "PARALLAX", value: "0.02°", detail: "AXIS DRIFT", level: 38 },
  { label: "LUMA", value: "64%", detail: "EXPOSURE", level: 64 },
  { label: "BUFFER", value: "768²", detail: "CROP GRID", level: 76 },
];

const appStyles = `
  :root {
    --etr-black: #030303;
    --etr-panel: rgba(17, 14, 10, 0.88);
    --etr-panel-hard: rgba(28, 22, 14, 0.96);
    --etr-line: rgba(186, 132, 45, 0.44);
    --etr-line-hard: rgba(225, 165, 63, 0.76);
    --etr-amber: #d79a37;
    --etr-amber-bright: #ffc15d;
    --etr-amber-dim: #8d682e;
    --etr-cyan: #66d6df;
    --etr-red: #ff654f;
    --etr-text: #ead5ad;
    --etr-muted: #8c7755;
    --etr-font-display: "Arial Narrow", "Roboto Condensed", "DIN Condensed", system-ui, sans-serif;
    --etr-font-mono: "Courier New", "Roboto Mono", ui-monospace, SFMono-Regular, monospace;
  }

  .escape-room-app, .escape-room-app * { box-sizing: border-box; }

  .escape-room-app {
    min-height: 100vh;
    overflow: hidden;
    position: relative;
    color: var(--etr-text);
    background:
      linear-gradient(rgba(255, 190, 91, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 190, 91, 0.032) 1px, transparent 1px),
      var(--etr-black);
    background-size: 54px 54px, 54px 54px, auto;
    background-attachment: fixed;
    font-family: var(--etr-font-mono);
    letter-spacing: 0;
  }

  .escape-room-app::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px);
    opacity: 0.22;
    mix-blend-mode: screen;
  }

  .er-header {
    display: grid;
    grid-template-columns: minmax(8.5rem, 1fr) minmax(18rem, 2.6fr) minmax(8.5rem, 1fr);
    align-items: center;
    gap: clamp(0.75rem, 2.2vw, 2rem);
    min-height: 8.5rem;
    padding: clamp(1rem, 2.2vw, 1.55rem) clamp(0.9rem, 3vw, 2.4rem) 0.9rem;
    border-bottom: 1px solid var(--etr-line);
    background: linear-gradient(180deg, rgba(20, 15, 9, 0.94), rgba(3, 3, 3, 0.58));
  }

  .brand-cell { display: flex; align-items: center; }
  .brand-cell.right { justify-content: flex-end; }

  .logo-module {
    width: clamp(5.7rem, 10vw, 8rem);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    position: relative;
    border: 1px solid var(--etr-line);
    background: linear-gradient(135deg, rgba(30, 23, 14, 0.92), rgba(9, 8, 6, 0.82));
    clip-path: polygon(11% 0, 89% 0, 100% 11%, 100% 89%, 89% 100%, 11% 100%, 0 89%, 0 11%);
  }

  .logo-module::after {
    content: "";
    position: absolute;
    inset: 0.45rem;
    border: 1px solid rgba(215, 154, 55, 0.22);
    pointer-events: none;
  }

  .logo-module img {
    max-width: 76%;
    max-height: 76%;
    object-fit: contain;
  }

  .title-stack { text-align: center; text-transform: uppercase; }

  .eyebrow, .panel-kicker, .metric-label, .terminal-meta, .scan-caption {
    color: var(--etr-muted);
    font-size: clamp(0.62rem, 1vw, 0.72rem);
    font-weight: 700;
    letter-spacing: 0.2em;
  }

  .title-stack h1 {
    margin: 0.35rem 0 0;
    color: var(--etr-amber-bright);
    font-family: var(--etr-font-display);
    font-size: clamp(2rem, 5.8vw, 4.85rem);
    font-weight: 900;
    line-height: 0.86;
    letter-spacing: 0.09em;
  }

  .title-rule {
    width: min(30rem, 82%);
    height: 1px;
    margin: 0.82rem auto 0;
    background: linear-gradient(90deg, transparent, var(--etr-line-hard), transparent);
  }

  .er-layout {
    display: grid;
    grid-template-columns: minmax(14rem, 0.78fr) minmax(24rem, 1.46fr) minmax(14rem, 0.78fr);
    grid-template-areas:
      "telemetry scanner clock"
      "terminal scanner diagnostics";
    gap: clamp(0.72rem, 1.45vw, 1.05rem);
    height: calc(100vh - 8.5rem);
    min-height: 31rem;
    padding: clamp(0.75rem, 1.45vw, 1.1rem) clamp(0.75rem, 2vw, 1.5rem) 1rem;
  }

  .panel {
    position: relative;
    border: 1px solid var(--etr-line);
    background: linear-gradient(145deg, var(--etr-panel-hard), var(--etr-panel));
    box-shadow: inset 0 1px 0 rgba(255, 206, 126, 0.09);
  }

  .panel::before, .scanner-frame::before {
    content: "";
    position: absolute;
    inset: 0.42rem;
    border: 1px solid rgba(215, 154, 55, 0.14);
    pointer-events: none;
  }

  .panel-kicker {
    display: flex;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.85rem 0.9rem 0.6rem;
    border-bottom: 1px solid rgba(186, 132, 45, 0.26);
  }

  .telemetry-panel { grid-area: telemetry; }
  .clock-panel { grid-area: clock; }
  .terminal-panel { grid-area: terminal; min-height: 0; }
  .diagnostics-panel { grid-area: diagnostics; }

  .gauge-stack { padding: 0.9rem; display: grid; gap: 0.78rem; }

  .gauge {
    border-left: 2px solid var(--etr-line-hard);
    padding: 0.58rem 0 0.58rem 0.72rem;
    background: linear-gradient(90deg, rgba(215,154,55,0.08), transparent);
  }

  .gauge-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.7rem; }
  .metric-label { color: var(--etr-amber-dim); }
  .gauge strong { color: var(--etr-amber-bright); font-size: 1rem; letter-spacing: 0.08em; }

  .gauge-track {
    height: 0.42rem;
    margin: 0.55rem 0 0.38rem;
    border: 1px solid rgba(215, 154, 55, 0.35);
    background: rgba(2, 2, 2, 0.82);
  }

  .gauge-track span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--etr-amber-dim), var(--etr-amber-bright));
  }

  .gauge small { color: var(--etr-muted); font-size: 0.68rem; letter-spacing: 0.16em; }

  .scanner-section {
    grid-area: scanner;
    min-width: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 0.85rem;
    align-items: center;
  }

  .scanner-frame {
    width: min(100%, calc(100vh - 13.25rem));
    max-width: 44rem;
    min-width: min(100%, 19rem);
    aspect-ratio: 1;
    justify-self: center;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--etr-line-hard);
    background: #050505;
    clip-path: polygon(5% 0, 95% 0, 100% 5%, 100% 95%, 95% 100%, 5% 100%, 0 95%, 0 5%);
  }

  .scanner-frame.active {
    animation: hardPulse 0.86s steps(2, end) infinite;
    box-shadow: 0 0 0 1px rgba(255, 193, 93, 0.36), 0 0 22px rgba(215, 154, 55, 0.18);
  }

  .scanner-video, .video-placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .scanner-video {
    object-fit: cover;
    transform: scaleX(-1);
  }

  .video-placeholder {
    display: grid;
    place-items: center;
    padding: 2rem;
    text-align: center;
    color: rgba(234, 213, 173, 0.34);
    font-size: clamp(0.78rem, 1.5vw, 1rem);
    font-weight: 800;
    letter-spacing: 0.18em;
    background:
      linear-gradient(45deg, transparent 49%, rgba(215,154,55,0.14) 50%, transparent 51%),
      linear-gradient(-45deg, transparent 49%, rgba(215,154,55,0.1) 50%, transparent 51%);
    background-size: 24px 24px;
  }

  .hud-cross.x, .hud-cross.y, .datum-box, .corner, .ruler, .laser-bar { position: absolute; pointer-events: none; }
  .hud-cross.x { left: 8%; right: 8%; top: 50%; height: 1px; background: rgba(102, 214, 223, 0.24); }
  .hud-cross.y { top: 8%; bottom: 8%; left: 50%; width: 1px; background: rgba(102, 214, 223, 0.22); }
  .datum-box { inset: 24%; border: 1px solid rgba(215,154,55,0.28); }

  .corner { width: 5.2rem; height: 5.2rem; max-width: 22%; max-height: 22%; border-color: var(--etr-amber-bright); opacity: 0.86; }
  .tl { top: 1.1rem; left: 1.1rem; border-top: 2px solid; border-left: 2px solid; }
  .tr { top: 1.1rem; right: 1.1rem; border-top: 2px solid; border-right: 2px solid; }
  .bl { bottom: 1.1rem; left: 1.1rem; border-bottom: 2px solid; border-left: 2px solid; }
  .br { bottom: 1.1rem; right: 1.1rem; border-bottom: 2px solid; border-right: 2px solid; }

  .ruler { left: 1.2rem; right: 1.2rem; bottom: 1.2rem; display: flex; justify-content: space-between; opacity: 0.48; }
  .ruler i { width: 1px; height: 0.5rem; background: var(--etr-amber); }
  .ruler i:nth-child(5n) { height: 0.95rem; }

  .laser-bar {
    left: -8%;
    right: -8%;
    height: 1.15rem;
    top: -3rem;
    background: linear-gradient(180deg, transparent, rgba(255, 193, 93, 0.2), rgba(255, 236, 176, 0.78), rgba(255, 193, 93, 0.2), transparent);
    border-top: 1px solid rgba(255, 236, 176, 0.68);
    border-bottom: 1px solid rgba(255, 193, 93, 0.44);
    animation: sweep 5s linear forwards;
  }

  .scan-control-row {
    justify-self: center;
    display: grid;
    grid-template-columns: minmax(11rem, auto) minmax(7.5rem, auto);
    gap: 0.7rem;
    align-items: stretch;
    width: min(100%, 31rem);
  }

  .scan-button, .timer-readout {
    border: 1px solid var(--etr-line-hard);
    background: linear-gradient(180deg, rgba(33, 25, 14, 0.98), rgba(9, 8, 6, 0.96));
    color: var(--etr-amber-bright);
    font-family: var(--etr-font-mono);
    font-weight: 900;
    letter-spacing: 0.16em;
    min-height: 3.35rem;
  }

  .scan-button { cursor: pointer; transition: transform 140ms ease, border-color 140ms ease, background 140ms ease; }
  .scan-button:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--etr-amber-bright); background: rgba(47, 34, 17, 0.98); }
  .scan-button:disabled { cursor: wait; color: var(--etr-muted); }

  .timer-readout {
    display: grid;
    place-items: center;
    font-size: 1.55rem;
    font-family: "DSEG7 Classic", "Digital-7", "Segment7", var(--etr-font-mono);
    font-variant-numeric: tabular-nums;
    text-shadow: none;
  }

  .timer-readout.active { color: var(--etr-cyan); box-shadow: inset 0 0 18px rgba(102, 214, 223, 0.08); }

  .mission-time {
    padding: 1rem 0.9rem 0.25rem;
    color: var(--etr-amber-bright);
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .clock-grid, .diagnostic-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    padding: 0.9rem;
  }

  .clock-grid span, .diagnostic-grid span {
    min-height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0.65rem;
    border: 1px solid rgba(186, 132, 45, 0.22);
    color: var(--etr-muted);
    font-size: 0.68rem;
    letter-spacing: 0.13em;
  }

  .clock-grid b, .diagnostic-grid b { color: var(--etr-text); font-size: 0.72rem; }

  .terminal-lines {
    height: calc(100% - 2.8rem);
    min-height: 9rem;
    overflow-y: auto;
    padding: 0.85rem 0.95rem 1rem;
    scrollbar-width: thin;
    scrollbar-color: var(--etr-line-hard) transparent;
  }

  .log-line {
    margin: 0 0 0.55rem;
    color: var(--etr-text);
    font-size: clamp(0.68rem, 1vw, 0.78rem);
    line-height: 1.45;
  }

  .log-line span { font-weight: 900; }
  .tone-tars span { color: var(--etr-amber-bright); }
  .tone-scan span { color: var(--etr-cyan); }
  .tone-warn span { color: var(--etr-red); }
  .tone-warn { color: #ffd0c8; }

  .scan-caption { text-align: center; padding-top: 0.4rem; color: var(--etr-amber-dim); }
  canvas[hidden] { display: none; }

  @keyframes sweep { to { top: calc(100% + 3rem); } }
  @keyframes hardPulse { 0%, 100% { border-color: var(--etr-line-hard); } 50% { border-color: var(--etr-amber-bright); } }

  @media (max-width: 980px) {
    .escape-room-app { overflow: auto; }
    .er-header { grid-template-columns: 5.8rem 1fr 5.8rem; min-height: 7.5rem; }
    .logo-module { width: 5.2rem; }
    .er-layout {
      height: auto;
      min-height: 0;
      grid-template-columns: 1fr 1fr;
      grid-template-areas:
        "scanner scanner"
        "telemetry clock"
        "terminal diagnostics";
    }
    .scanner-frame { width: min(100%, 34rem); }
  }

  @media (max-width: 640px) {
    .er-header { grid-template-columns: 1fr; text-align: center; }
    .brand-cell, .brand-cell.right { justify-content: center; }
    .brand-cell.right { order: 3; }
    .title-stack { order: 2; }
    .er-layout { grid-template-columns: 1fr; grid-template-areas: "scanner" "telemetry" "clock" "terminal" "diagnostics"; }
    .scan-control-row { grid-template-columns: 1fr; }
  }
`;

function formatTimer(value) {
  return `0:${String(Math.max(0, value)).padStart(2, "0")}`;
}

function normalizePrediction(payload) {
  if (!payload || typeof payload !== "object") return "RECEIVED";
  return String(
    payload.access_code ??
      payload.prediction ??
      payload.label ??
      payload.class ??
      payload.result ??
      payload.status ??
      "RECEIVED",
  ).toUpperCase();
}

function getDetectedObject(payload) {
  if (!payload || !payload.detections || payload.detections.length === 0) return null;
  const best = payload.detections[0];
  return `${best.class.toUpperCase()} (${Math.round(best.confidence * 100)}%)`;
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const [clock, setClock] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [remaining, setRemaining] = useState(5);
  const [cameraState, setCameraState] = useState("REQUESTING OPTICS");
  const [scanResult, setScanResult] = useState("STANDBY");
  const [detectedObject, setDetectedObject] = useState(null);

  const isScanning = phase === "scanning";

  useEffect(() => {
    let cancelled = false;

    async function bootCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("OPTICS UNAVAILABLE");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraState("OPTICS LIVE");
      } catch {
        setCameraState("CAMERA PERMISSION REQUIRED");
      }
    }

    bootCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.clearInterval(intervalRef.current);
      window.clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setClock(new Date());
    const ticker = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(ticker);
  }, []);

  const captureAndPredict = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setPhase("error");
      setScanResult("NO FRAME");
      return;
    }

    setPhase("transmitting");
    setScanResult("UPLINK");

    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    canvas.width = 768;
    canvas.height = 768;

    const context = canvas.getContext("2d");
    if (!context) {
      setPhase("error");
      setScanResult("NO CANVAS");
      return;
    }

    context.drawImage(video, sx, sy, side, side, 0, 0, canvas.width, canvas.height);

    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("Frame encoding failed");

      const formData = new FormData();
      formData.append("file", blob, "escape-room-scan.jpg");

      const response = await fetch(PREDICT_ENDPOINT + "/predict", { 
        method: "POST", 
        body: formData,
        signal: AbortSignal.timeout(120000) // 2 min timeout for slow Render instances
      });
      if (!response.ok) throw new Error(`Predict failed: ${response.status}`);

      const payload = await response.json().catch(() => ({ status: "RECEIVED" }));
      setScanResult(normalizePrediction(payload));
      setDetectedObject(getDetectedObject(payload));
      setPhase("complete");
    } catch {
      setScanResult("LINK FAULT");
      setPhase("error");
    }
  }, []);

  const beginScan = useCallback(() => {
    if (isScanning) return;

    window.clearInterval(intervalRef.current);
    window.clearTimeout(timeoutRef.current);

    const start = Date.now();
    setPhase("scanning");
    setRemaining(5);
    setScanResult("ACQUIRING");

    intervalRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setRemaining(Math.max(0, 5 - elapsed));
    }, 120);

    timeoutRef.current = window.setTimeout(() => {
      window.clearInterval(intervalRef.current);
      setRemaining(0);
      captureAndPredict();
    }, 5000);
  }, [captureAndPredict, isScanning]);

  const missionTime = clock
    ? clock.toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" })
    : "--:--:--";
  const missionDate = clock
    ? clock
        .toLocaleDateString("en-GB", {
          timeZone: "UTC",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .toUpperCase()
    : "-- --- ----";
  const logs = useMemo(() => TARS_MAP[phase] ?? TARS_MAP.idle, [phase]);

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-black">
      <style>{appStyles}</style>

      <header className="er-header">
        <div className="brand-cell">
          <div className="logo-module" aria-label="ISTE logo module">
            <img src={isteLogo} alt="ISTE BITS logo" />
          </div>
        </div>

        <div className="title-stack">
          <div className="eyebrow">ISTE BITS PRESENTS TRIVENI&apos;26</div>
          <h1>ESCAPE THE ROOM</h1>
          <div className="title-rule" />
        </div>

        <div className="brand-cell right">
          <div className="logo-module" aria-label="Triveni 26 logo module">
            <img src={triveniLogo} alt="Triveni 26 logo" />
          </div>
        </div>
      </header>

      <section className="er-layout">
        <aside className="panel telemetry-panel">
          <div className="panel-kicker">
            <span>TELEMETRY</span>
            <span>BUS A</span>
          </div>
          <div className="gauge-stack">
            {gauges.map((gauge) => (
              <div className="gauge" key={gauge.label}>
                <div className="gauge-head">
                  <span className="metric-label">{gauge.label}</span>
                  <strong>{gauge.value}</strong>
                </div>
                <div className="gauge-track" aria-hidden="true">
                  <span style={{ width: `${gauge.level}%` }} />
                </div>
                <small>{gauge.detail}</small>
              </div>
            ))}
          </div>
        </aside>

        <section className="scanner-section" aria-label="Central optical acquisition bay">
          <div className={isScanning ? "scanner-frame active" : "scanner-frame"}>
            <video
              ref={videoRef}
              className="scanner-video"
              autoPlay
              muted
              playsInline
              aria-label="Live webcam feed"
            />
            {cameraState !== "OPTICS LIVE" && (
              <div className="video-placeholder">{cameraState}</div>
            )}
            <div className="hud-cross x" />
            <div className="hud-cross y" />
            <div className="datum-box" />
            <div className="corner tl" />
            <div className="corner tr" />
            <div className="corner bl" />
            <div className="corner br" />
            <div className="ruler" aria-hidden="true">
              {Array.from({ length: 25 }).map((_, index) => (
                <i key={index} />
              ))}
            </div>
            {isScanning && <div className="laser-bar" aria-hidden="true" />}
          </div>

          <div>
            <div className="scan-control-row">
              <button
                className="scan-button"
                type="button"
                onClick={beginScan}
                disabled={isScanning}
              >
                {isScanning ? "SCANNING" : "START SCAN"}
              </button>
              <div
                className={isScanning ? "timer-readout active" : "timer-readout"}
                aria-live="polite"
              >
                {formatTimer(isScanning ? remaining : 5)}
              </div>
            </div>
            <div className="scan-caption">
              OPTICAL ACQUISITION BAY // LOCAL CLASSIFIER ENDPOINT {PREDICT_ENDPOINT}
            </div>
          </div>
          <canvas ref={canvasRef} hidden aria-hidden="true" />
        </section>

        <aside className="panel clock-panel">
          <div className="panel-kicker">
            <span>MISSION CLOCK</span>
            <span>UTC</span>
          </div>
          <div className="mission-time">{missionTime}</div>
          <div className="clock-grid">
            <span>
              DATE <b>{missionDate}</b>
            </span>
            <span>
              SYNC <b>99.98</b>
            </span>
            <span>
              STATE <b>{phase.toUpperCase()}</b>
            </span>
            <span>
              RESULT <b>{scanResult}</b>
            </span>
          </div>
        </aside>

        <section className="panel terminal-panel">
          <div className="panel-kicker">
            <span>TARS TERMINAL</span>
            <span>SCROLL LOCK</span>
          </div>
          <div className="terminal-lines" aria-live="polite">
            {logs.map((line, index) => (
              <p className={`log-line tone-${line.tone}`} key={`${line.tag}-${index}`}>
                <span>[{line.tag}]</span> {line.text}
              </p>
            ))}
          </div>
        </section>

        <aside className="panel diagnostics-panel">
          <div className="panel-kicker">
            <span>CHAMBER DIAGNOSTICS</span>
            <span>LOCKED</span>
          </div>
          <div className="diagnostic-grid">
            <span>
              EVENT <b>TRIVENI&apos;26</b>
            </span>
            <span>
              HOST <b>ISTE BITS</b>
            </span>
            <span>
              MODE <b>ESCAPE</b>
            </span>
            <span>
              CAMERA <b>{cameraState}</b>
            </span>
            <span>
              SCAN <b>{isScanning ? "ACTIVE" : "READY"}</b>
            </span>
            <span>
              LINK <b>{phase === "error" ? "FAULT" : "ARMED"}</b>
            </span>
            {detectedObject && (
              <span>
                TARGET <b style={{ color: "var(--etr-amber-bright)" }}>{detectedObject}</b>
              </span>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
