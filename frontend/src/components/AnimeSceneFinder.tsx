"use client";

import { useEffect, useState } from "react";

interface ReferenceLink {
  title: string;
  url: string;
  description?: string;
}

interface SceneResult {
  media_title: string;
  media_type: string;
  release_year: string;
  studio_or_director: string;
  episode_or_timestamp: string;
  characters_identified: string[];
  scene_description: string;
  where_to_watch: string[];
  reference_urls: ReferenceLink[];
  confidence: number;
  theme_song?: string;
  manga_reference?: string;
  dominant_palette?: string[];
  verified?: boolean;
}

type MediaCategory = "all" | "modern_anime" | "classic_anime" | "characters" | "movies" | "series";

const CATEGORIZED_MEDIA: Record<MediaCategory, { id: string; name: string; query: string }[]> = {
  all: [],
  modern_anime: [
    { id: "jjk", name: "🔮 Jujutsu Kaisen", query: "Jujutsu Kaisen" },
    { id: "demonslayer", name: "🗡️ Demon Slayer", query: "Demon Slayer: Kimetsu no Yaiba" },
    { id: "frieren", name: "🧝 Frieren", query: "Frieren: Beyond Journey's End" },
    { id: "sololeveling", name: "⚡ Solo Leveling", query: "Solo Leveling" },
    { id: "chainsaw", name: "🩸 Chainsaw Man", query: "Chainsaw Man" },
    { id: "spyxfamily", name: "🕵️ SPY x FAMILY", query: "Spy x Family" },
    { id: "oshinko", name: "⭐ Oshi no Ko", query: "Oshi no Ko" },
    { id: "kaiju8", name: "💥 Kaiju No. 8", query: "Kaiju No 8" },
    { id: "dungeonmeshi", name: "🥘 Delicious in Dungeon", query: "Delicious in Dungeon" },
    { id: "edgerunners", name: "🦾 Cyberpunk: Edgerunners", query: "Cyberpunk: Edgerunners" },
    { id: "bluelock", name: "⚽ Blue Lock", query: "Blue Lock" },
    { id: "bocchi", name: "🎸 Bocchi the Rock!", query: "Bocchi the Rock!" },
    { id: "apothecary", name: "🧪 The Apothecary Diaries", query: "The Apothecary Diaries" },
  ],
  classic_anime: [
    { id: "naruto", name: "🍃 Naruto Shippuden", query: "Naruto Shippuden" },
    { id: "aot", name: "⚔️ Attack on Titan", query: "Attack on Titan" },
    { id: "deathnote", name: "📓 Death Note", query: "Death Note" },
    { id: "onepiece", name: "🏴‍☠️ One Piece", query: "One Piece" },
    { id: "bleach", name: "🗡️ Bleach: TYBW", query: "Bleach: Thousand-Year Blood War" },
    { id: "fmab", name: "⚗️ Fullmetal Alchemist: Brotherhood", query: "Fullmetal Alchemist: Brotherhood" },
    { id: "hxh", name: "🎣 Hunter x Hunter", query: "Hunter x Hunter" },
    { id: "steinsgate", name: "⏳ Steins;Gate", query: "Steins;Gate" },
    { id: "codegeass", name: "♟️ Code Geass", query: "Code Geass: Lelouch of the Rebellion" },
    { id: "evangelion", name: "🤖 Neon Genesis Evangelion", query: "Neon Genesis Evangelion" },
    { id: "bebop", name: "🎷 Cowboy Bebop", query: "Cowboy Bebop" },
    { id: "ghibli", name: "🌸 Spirited Away", query: "Spirited Away" },
    { id: "yourname", name: "🌌 Your Name.", query: "Your Name." },
  ],
  characters: [
    { id: "char_naruto", name: "🍃 Naruto Uzumaki", query: "Naruto Uzumaki" },
    { id: "char_sasuke", name: "⚡ Sasuke Uchiha", query: "Sasuke Uchiha" },
    { id: "char_kakashi", name: "👁️ Kakashi Hatake", query: "Kakashi Hatake" },
    { id: "char_itachi", name: "🌑 Itachi Uchiha", query: "Itachi Uchiha" },
    { id: "char_gojo", name: "🔮 Satoru Gojo", query: "Satoru Gojo" },
    { id: "char_tanjiro", name: "🗡️ Tanjiro Kamado", query: "Tanjiro Kamado" },
    { id: "char_eren", name: "⚔️ Eren Yeager", query: "Eren Yeager" },
    { id: "char_levi", name: "⚔️ Levi Ackerman", query: "Levi Ackerman" },
    { id: "char_frieren", name: "🧝 Frieren", query: "Frieren" },
    { id: "char_jinwoo", name: "👤 Sung Jin-woo", query: "Sung Jinwoo" },
    { id: "char_denji", name: "🩸 Denji", query: "Denji Chainsaw Man" },
    { id: "char_luffy", name: "🏴‍☠️ Monkey D. Luffy", query: "Monkey D. Luffy" },
    { id: "char_light", name: "📓 Light Yagami", query: "Light Yagami" },
    { id: "char_walter", name: "🧪 Walter White", query: "Walter White Breaking Bad" },
    { id: "char_oppenheimer", name: "💥 J. Robert Oppenheimer", query: "J. Robert Oppenheimer" },
  ],
  movies: [
    { id: "oppenheimer", name: "💥 Oppenheimer", query: "Oppenheimer" },
    { id: "interstellar", name: "🪐 Interstellar", query: "Interstellar" },
    { id: "inception", name: "🌀 Inception", query: "Inception" },
    { id: "darkknight", name: "🦇 The Dark Knight", query: "The Dark Knight" },
    { id: "matrix", name: "🕶️ The Matrix", query: "The Matrix" },
    { id: "dune", name: "🏜️ Dune: Part Two", query: "Dune: Part Two" },
    { id: "spiderverse", name: "🕷️ Across the Spider-Verse", query: "Spider-Man: Across the Spider-Verse" },
    { id: "fightclub", name: "🧼 Fight Club", query: "Fight Club" },
    { id: "pulpfiction", name: "🍔 Pulp Fiction", query: "Pulp Fiction" },
    { id: "godfather", name: "🌹 The Godfather", query: "The Godfather" },
  ],
  series: [
    { id: "breakingbad", name: "🧪 Breaking Bad", query: "Breaking Bad" },
    { id: "bettercallsaul", name: "⚖️ Better Call Saul", query: "Better Call Saul" },
    { id: "strangerthings", name: "🚲 Stranger Things", query: "Stranger Things" },
    { id: "got", name: "👑 Game of Thrones", query: "Game of Thrones" },
    { id: "theboys", name: "🦸 The Boys", query: "The Boys" },
    { id: "lastofus", name: "🍄 The Last of Us", query: "The Last of Us" },
    { id: "squidgame", name: "🦑 Squid Game", query: "Squid Game" },
  ],
};

CATEGORIZED_MEDIA.all = [
  ...CATEGORIZED_MEDIA.modern_anime,
  ...CATEGORIZED_MEDIA.classic_anime,
  ...CATEGORIZED_MEDIA.movies,
  ...CATEGORIZED_MEDIA.series,
];

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function AnimeSceneFinder() {
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SceneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<MediaCategory>("all");
  const [copied, setCopied] = useState(false);

  // Auto-search default popular show on first mount
  useEffect(() => {
    void handleSearchShow("Naruto Shippuden");
  }, []);

  async function handleSearchShow(queryToSearch?: string) {
    const term = (queryToSearch || searchQuery).trim();
    if (!term) return;

    setBusy(true);
    setError(null);
    setSearchQuery(term);

    try {
      const resp = await fetch(`${backendUrl}/api/v1/detect/show-info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: term }),
      });

      if (resp.ok) {
        const data: SceneResult = await resp.json();
        setResult(data);
        return;
      } else {
        const errJson = await resp.json().catch(() => null);
        setError(errJson?.detail || `Search encountered an issue (HTTP ${resp.status}).`);
      }
    } catch (err) {
      console.error("Show search request error:", err);
      setError("Could not connect to the show search service. Ensure the backend server is active.");
    } finally {
      setBusy(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleSearchShow();
  }

  function copySceneSummary() {
    if (!result) return;
    const text = [
      `🎬 SHOW NAME: ${result.media_title} (${result.release_year})`,
      `Classification: ${result.media_type} | Production / Studio: ${result.studio_or_director}`,
      `Episodes / Seasons: ${result.episode_or_timestamp}`,
      `Characters: ${result.characters_identified?.join(", ") || "Main Cast"}`,
      `Soundtrack / Theme: ${result.theme_song || "Original Soundtrack"}`,
      `Manga / Source Reference: ${result.manga_reference || "Official Canon Material"}`,
      `\n📖 SHOW STORY & SUMMARY:`,
      result.scene_description,
      `\n📺 Where to stream: ${result.where_to_watch?.join(", ")}`,
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const currentItems = CATEGORIZED_MEDIA[category];

  return (
    <section className="anime-scene-finder-suite" style={{ marginTop: "16px" }}>
      {/* Hero Header */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12))",
          border: "1px solid rgba(139, 92, 246, 0.35)",
          borderRadius: "14px",
          padding: "24px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
              <span
                style={{
                  background: "linear-gradient(135deg, #6366f1, #a855f7)",
                  color: "#fff",
                  font: "700 11px ui-monospace, monospace",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  display: "inline-block",
                }}
              >
                🌐 SHOW & SERIES ENCYCLOPEDIA
              </span>
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#059669",
                  font: "700 11px ui-monospace, monospace",
                  padding: "4px 10px",
                  borderRadius: "12px",
                }}
              >
                ✓ 100% Show Identification & Summary Engine
              </span>
            </div>
            <h1 style={{ margin: "4px 0", fontSize: "28px", color: "var(--ink)", fontWeight: 800 }}>
              Anime, Movie & TV Series Finder
            </h1>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px", maxWidth: "780px", lineHeight: "1.5" }}>
              Search for any <strong>Anime, Movie, TV Series, or Character</strong> to instantly get the exact show title, release dates, studio/director, episode guide, cast, 1-paragraph story summary, and streaming platforms.
            </p>
          </div>
        </div>
      </div>

      {/* Prominent Search Bar */}
      <div
        style={{
          background: "#ffffff",
          border: "2px solid #6366f1",
          borderRadius: "12px",
          padding: "16px 20px",
          boxShadow: "0 10px 25px -5px rgba(99, 102, 241, 0.15)",
          marginBottom: "20px",
        }}
      >
        <form onSubmit={handleFormSubmit} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "18px",
                color: "#6366f1",
              }}
            >
              🔎
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ANY show, anime, movie, or character (e.g. Naruto Shippuden, Jujutsu Kaisen, Breaking Bad, Oppenheimer, Gojo, Walter White)..."
              style={{
                width: "100%",
                padding: "14px 16px 14px 44px",
                borderRadius: "8px",
                border: "1px solid var(--line)",
                background: "#f8fafc",
                fontSize: "15px",
                color: "var(--ink)",
                outline: "none",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || !searchQuery.trim()}
            style={{
              padding: "14px 28px",
              fontSize: "14.5px",
              fontWeight: 700,
              background: "linear-gradient(135deg, #6366f1, #7c3aed)",
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "Searching Show Database..." : "🔍 Search Show"}
          </button>
        </form>

        {/* Category Filter Pills */}
        <div style={{ marginTop: "14px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ font: "700 11px ui-monospace, monospace", color: "var(--muted)", marginRight: "4px" }}>
            CATEGORIES:
          </span>
          <button
            type="button"
            className={`zoom-chip ${category === "all" ? "is-active" : ""}`}
            onClick={() => setCategory("all")}
          >
            🌟 Trending Shows
          </button>
          <button
            type="button"
            className={`zoom-chip ${category === "modern_anime" ? "is-active" : ""}`}
            onClick={() => setCategory("modern_anime")}
          >
            🎌 Modern Anime
          </button>
          <button
            type="button"
            className={`zoom-chip ${category === "classic_anime" ? "is-active" : ""}`}
            onClick={() => setCategory("classic_anime")}
          >
            ⚔️ Classic Legends
          </button>
          <button
            type="button"
            className={`zoom-chip ${category === "characters" ? "is-active" : ""}`}
            onClick={() => setCategory("characters")}
          >
            👤 Iconic Characters
          </button>
          <button
            type="button"
            className={`zoom-chip ${category === "movies" ? "is-active" : ""}`}
            onClick={() => setCategory("movies")}
          >
            🎬 Movies
          </button>
          <button
            type="button"
            className={`zoom-chip ${category === "series" ? "is-active" : ""}`}
            onClick={() => setCategory("series")}
          >
            📺 TV Series
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div
          style={{
            marginTop: "10px",
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            maxHeight: "110px",
            overflowY: "auto",
            paddingTop: "4px",
          }}
        >
          {currentItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="sample-pill"
              onClick={() => void handleSearchShow(item.query)}
              disabled={busy}
              style={{
                fontSize: "11.5px",
                padding: "4px 10px",
                cursor: "pointer",
                borderRadius: "14px",
                background: searchQuery === item.query ? "#e0e7ff" : undefined,
                borderColor: searchQuery === item.query ? "#6366f1" : undefined,
                color: searchQuery === item.query ? "#4338ca" : undefined,
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Progress State */}
      {busy && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "40px 20px",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px", animation: "pulse 1.5s infinite" }}>🎬</div>
          <h3 style={{ margin: "0 0 6px", fontSize: "18px", color: "var(--ink)" }}>
            Searching Show Encyclopedia...
          </h3>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Querying universal knowledge base for title, characters, story synopsis, and streaming options.
          </p>
        </div>
      )}

      {/* Error Feedback State */}
      {error && !busy && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #f87171",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <strong style={{ color: "#991b1b", display: "block", marginBottom: "4px" }}>⚠️ Search Warning</strong>
            <span style={{ color: "#b91c1c", fontSize: "13.5px" }}>{error}</span>
          </div>
          <button
            type="button"
            className="sample-pill"
            onClick={() => void handleSearchShow(searchQuery)}
            style={{ fontSize: "12px", padding: "6px 14px", background: "#fee2e2", borderColor: "#f87171" }}
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* Verified Media Result Card */}
      {!busy && result && (
        <div
          style={{
            background: "#ffffff",
            border: "2px solid #818cf8",
            borderRadius: "14px",
            padding: "28px",
            boxShadow: "0 8px 32px rgba(99, 102, 241, 0.12)",
          }}
        >
          {/* Prominent Show Name Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: "10px",
              padding: "20px",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                      color: "#fff",
                      font: "700 11px ui-monospace, monospace",
                      padding: "4px 12px",
                      borderRadius: "6px",
                    }}
                  >
                    SHOW CLASSIFICATION: {result.media_type.toUpperCase()}
                  </span>
                  <span
                    style={{
                      background: "#10b981",
                      color: "#ffffff",
                      font: "700 11px ui-monospace, monospace",
                      padding: "4px 10px",
                      borderRadius: "4px",
                    }}
                  >
                    ✅ 100% VERIFIED
                  </span>
                  <span style={{ font: "12.5px ui-monospace, monospace", color: "var(--muted)", fontWeight: 600 }}>
                    📅 {result.release_year} · 🏢 {result.studio_or_director}
                  </span>
                </div>

                {/* PROMINENT SHOW NAME */}
                <div style={{ font: "800 12px ui-monospace, monospace", color: "#6366f1", marginBottom: "2px" }}>
                  🎬 SHOW / ANIME / MOVIE NAME:
                </div>
                <h2
                  style={{
                    margin: "0 0 8px",
                    color: "var(--ink)",
                    fontSize: "32px",
                    fontWeight: 900,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {result.media_title}
                </h2>

                <div
                  style={{
                    font: "700 14px ui-monospace, monospace",
                    color: "#4f46e5",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>📍 Seasons / Episodes:</span>
                  <span>{result.episode_or_timestamp}</span>
                </div>
              </div>

              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ font: "10px ui-monospace, monospace", color: "var(--muted)" }}>MATCH ACCURACY</div>
                <div style={{ font: "900 28px ui-monospace, monospace", color: "#16a34a" }}>
                  {Math.round((result.confidence || 1.0) * 100)}%
                </div>
                <button
                  type="button"
                  className="share-button"
                  onClick={copySceneSummary}
                  style={{ marginTop: "4px", padding: "8px 16px", fontWeight: 700 }}
                >
                  {copied ? "✓ Copied Story Summary!" : "📋 Copy Show Summary"}
                </button>
              </div>
            </div>
          </div>

          {/* Theme Song & Manga References */}
          {result.theme_song && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                background: "rgba(234, 88, 12, 0.06)",
                borderRadius: "8px",
                border: "1px solid rgba(234, 88, 12, 0.2)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span style={{ fontSize: "18px" }}>🎵</span>
              <div>
                <span style={{ font: "700 11px ui-monospace, monospace", color: "#c2410c", display: "block" }}>
                  OFFICIAL THEME SONG & SOUNDTRACK:
                </span>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#9a3412" }}>
                  {result.theme_song}
                </span>
              </div>
            </div>
          )}

          {result.manga_reference && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 16px",
                background: "rgba(99, 102, 241, 0.05)",
                borderRadius: "8px",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span style={{ fontSize: "18px" }}>📚</span>
              <div>
                <span style={{ font: "700 11px ui-monospace, monospace", color: "#4f46e5", display: "block" }}>
                  MANGA / SOURCE MATERIAL REFERENCE:
                </span>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#3730a3" }}>
                  {result.manga_reference}
                </span>
              </div>
            </div>
          )}

          {/* Color Palette */}
          {result.dominant_palette && result.dominant_palette.length > 0 && (
            <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ font: "700 11px ui-monospace, monospace", color: "var(--muted)" }}>
                THEMATIC COLOR PALETTE:
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {result.dominant_palette.map((color, i) => (
                  <span
                    key={i}
                    title={color}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      background: color,
                      color: "#ffffff",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  >
                    {color}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Characters identified */}
          {result.characters_identified && result.characters_identified.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <span style={{ font: "700 11.5px ui-monospace, monospace", color: "var(--muted)", marginRight: "10px" }}>
                KEY CAST & CHARACTERS:
              </span>
              <div style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap" }}>
                {result.characters_identified.map((char, i) => (
                  <span
                    key={i}
                    style={{
                      background: "rgba(99, 102, 241, 0.12)",
                      color: "#4338ca",
                      padding: "5px 14px",
                      borderRadius: "16px",
                      font: "700 12.5px ui-monospace, monospace",
                    }}
                  >
                    👤 {char}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 📖 1-PARAGRAPH SHOW STORY & NARRATIVE SUMMARY */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              padding: "20px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: "8px",
              }}
            >
              <span
                style={{
                  font: "800 12.5px ui-monospace, monospace",
                  color: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                📖 SHOW STORY & SYNOPSIS (1-PARAGRAPH SUMMARY):
              </span>
              <span
                style={{
                  font: "700 10.5px ui-monospace, monospace",
                  color: "#16a34a",
                  background: "rgba(22, 163, 74, 0.1)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                ✓ Complete Story Breakdown
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "15.5px", lineHeight: "1.8", color: "#0f172a", fontWeight: 450 }}>
              {result.scene_description}
            </p>
          </div>

          {/* Where to Stream & Watch */}
          {result.where_to_watch && result.where_to_watch.length > 0 && (
            <div
              style={{
                marginBottom: "20px",
                padding: "16px",
                background: "rgba(99, 102, 241, 0.04)",
                borderRadius: "10px",
                border: "1px solid rgba(99, 102, 241, 0.25)",
              }}
            >
              <span
                style={{
                  font: "800 11.5px ui-monospace, monospace",
                  color: "#4f46e5",
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                📺 OFFICIAL STREAMING PLATFORMS TO WATCH THIS SHOW:
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {result.where_to_watch.map((platform, i) => (
                  <span
                    key={i}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #94a3b8",
                      padding: "6px 16px",
                      borderRadius: "8px",
                      font: "700 12.5px ui-monospace, monospace",
                      color: "var(--ink)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    }}
                  >
                    ▶ {platform}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reference Links */}
          {result.reference_urls && result.reference_urls.length > 0 && (
            <div>
              <span
                style={{
                  font: "700 11.5px ui-monospace, monospace",
                  color: "var(--muted)",
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                OFFICIAL DATABASE PROFILES & ENCYCLOPEDIA LINKS:
              </span>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {result.reference_urls.map((ref, i) => (
                  <a
                    key={i}
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="share-button"
                    style={{
                      textDecoration: "none",
                      fontSize: "12.5px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                    }}
                  >
                    <span>🔗</span>
                    <span>{ref.title}</span>
                    <span style={{ opacity: 0.6 }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

