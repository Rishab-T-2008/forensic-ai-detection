"use client";

import { useEffect, useRef, useState } from "react";
import { askAboutImage } from "@/lib/api";

import type { DetectionResponse } from "@/types/detection";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  time: string;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={idx} className="chat-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderMarkdownContent(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={lineIdx} className="chat-spacer" />;
    }

    // Header 3 or 4: ### Heading
    if (trimmed.startsWith("### ")) {
      return (
        <h4 key={lineIdx} className="chat-h4">
          {trimmed.replace(/^###\s+/, "")}
        </h4>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={lineIdx} className="chat-h3">
          {trimmed.replace(/^##\s+/, "")}
        </h3>
      );
    }

    // Bullet lists: - item or * item
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const content = trimmed.replace(/^[-*]\s+/, "");
      return (
        <div key={lineIdx} className="chat-bullet-row">
          <span className="chat-bullet-dot">•</span>
          <span>{renderInlineMarkdown(content)}</span>
        </div>
      );
    }

    // Numbered lists: 1. item
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      return (
        <div key={lineIdx} className="chat-numbered-row">
          <span className="chat-num-badge">{numberedMatch[1]}.</span>
          <span>{renderInlineMarkdown(numberedMatch[2])}</span>
        </div>
      );
    }

    // Regular paragraph
    return (
      <p key={lineIdx} className="chat-paragraph">
        {renderInlineMarkdown(line)}
      </p>
    );
  });
}

export function ImageAssistant({
  file,
  result,
}: {
  file: File | null;
  result?: DetectionResponse | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "HI I AM SON AI .ITS MY PLEASURE TO MEET YOU.ASK ANY QUESTION YOU HAVE ABOUT THE GIVEN ANSWER.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [isOpen, messages, busy]);

  async function handleSend(queryText?: string) {
    const textToSend = (queryText || question).trim();
    if (!textToSend || busy) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "user",
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setBusy(true);

    let diagnosticContext = "";
    if (result) {
      diagnosticContext = [
        `Engine Verdict: ${result.verdict.toUpperCase()}`,
        `Calculated Confidence: ${Math.round(result.confidence * 100)}%`,
        `AI Probability: ${result.ai_percentage}% | Real Probability: ${result.real_percentage}%`,
        result.signals ? `Detection Signals: ${JSON.stringify(result.signals)}` : null,
        result.metadata ? `Forensic Provenance: ${JSON.stringify(result.metadata)}` : null,
        result.entity_info
          ? `Identified Real-World Subject: ${result.entity_info.identified_subject} (Physical existence verified: ${result.entity_info.exists_in_reality})`
          : null,
        result.entity_info?.informative_note
          ? `Entity Grounding Note: ${result.entity_info.informative_note}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    try {
      const answer = await askAboutImage(file, textToSend, diagnosticContext || undefined);
      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text: answer,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (cause) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: "assistant",
        text:
          cause instanceof Error
            ? `⚠️ ${cause.message}`
            : "⚠️ SON AI could not answer at this moment.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setBusy(false);
    }
  }

  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function toggleSpeak(text: string, id: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Strip markdown symbols for clean speech narration
    const cleanText = text
      .replace(/[#*`_~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  function clearHistory() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    setMessages([
      {
        id: "reset",
        sender: "assistant",
        text: "HI I AM SON AI .ITS MY PLEASURE TO MEET YOU.ASK ANY QUESTION YOU HAVE ABOUT THE GIVEN ANSWER.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  }

  const promptChips = result
    ? [
        `🔬 Detail the physical evidence for this ${result.verdict} verdict`,
        "👁️ Scrutinize ray-traced lighting, shadows & reflections",
        "🧬 Evaluate anatomical micro-textures & skin pore realism",
        "📊 Break down the 2D-FFT frequency spectrum results",
        "🌐 Tell me about the real-world subject & its origin",
      ]
    : file
    ? [
        "🔬 What physical evidence looks suspicious in this photo?",
        "👁️ Check lighting & shadow convergence coherence",
        "📐 Are perspective lines and reflections natural?",
        "🔬 Explain the mathematical 2D-FFT frequency analysis",
      ]
    : [
        "🔬 How does 2D-FFT frequency analysis detect AI deepfakes?",
        "🛡️ What is C2PA cryptographic provenance metadata?",
        "💡 How do diffusion models leave mathematical artifacts?",
        "🔎 What are the best visual giveaways of Midjourney v6?",
      ];

  return (
    <>
      {/* Cool Floating Assistant Trigger Orb */}
      <div className="assistant-floating-dock">
        <button
          type="button"
          className={`assistant-trigger-btn ${isOpen ? "is-active" : ""}`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Toggle SON AI"
          title="Open SON AI"
        >
          <span className="assistant-orb-glow" />
          <span className="assistant-orb-core">
            <span className="assistant-icon">✨</span>
            <span className="assistant-label">SON AI</span>
          </span>
        </button>
      </div>

      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="assistant-chat-drawer" role="dialog" aria-label="SON AI Chat Drawer">
          <div className="drawer-header">
            <div className="header-info">
              <span className="status-beacon" />
              <div>
                <strong>SON AI</strong>
                <span className="subtitle">Senior Forensics Intelligence</span>
              </div>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="header-tool-btn"
                onClick={clearHistory}
                title="Clear chat history"
              >
                ↺
              </button>
              <button
                type="button"
                className="header-tool-btn close"
                onClick={() => {
                  if (typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                  setSpeakingId(null);
                  setIsOpen(false);
                }}
                title="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="dialog-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message-row ${msg.sender}`}>
                <span className="avatar" aria-hidden="true">
                  {msg.sender === "assistant" ? "✨" : "👤"}
                </span>
                <div className="message-bubble">
                  <div className="message-text">
                    {msg.sender === "user" ? (
                      <p className="chat-paragraph user-text-content">{msg.text}</p>
                    ) : (
                      renderMarkdownContent(msg.text)
                    )}
                  </div>
                  <div className="message-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                    <span className="message-time">{msg.time}</span>
                    {msg.sender === "assistant" && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className={`narration-btn ${speakingId === msg.id ? "is-speaking" : ""}`}
                          onClick={() => toggleSpeak(msg.text, msg.id)}
                          title={speakingId === msg.id ? "Stop voice narration" : "Listen to answer"}
                        >
                          {speakingId === msg.id ? "⏹️ Stop" : "🔊 Listen"}
                        </button>
                        <button
                          type="button"
                          className="copy-msg-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(msg.text);
                            const el = document.getElementById(`copy-btn-${msg.id}`);
                            if (el) {
                              el.innerText = "✓ Copied";
                              setTimeout(() => {
                                el.innerText = "📋 Copy";
                              }, 2000);
                            }
                          }}
                          id={`copy-btn-${msg.id}`}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#94a3b8",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            transition: "color 0.2s ease",
                          }}
                          title="Copy this response to clipboard"
                        >
                          📋 Copy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {busy && (
              <div className="chat-message-row assistant">
                <span className="avatar">✨</span>
                <div className="message-bubble thinking">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="dialog-suggestions">
            {promptChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="chip-btn"
                onClick={() => handleSend(chip)}
                disabled={busy}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            className="dialog-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder={
                result
                  ? "Ask SON AI about this result, lighting, or frequency math..."
                  : "Ask SON AI any forensic or general question..."
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="send-btn"
              title="Send question"
            >
              ➔
            </button>
          </form>
        </div>
      )}
    </>
  );
}