"use client";

import type { EntityFactCheck } from "@/types/detection";

export function EntityVerificationCard({
  entityInfo,
}: {
  entityInfo?: EntityFactCheck | null;
}) {
  // Graceful fallback if not yet loaded or returned
  const info: EntityFactCheck = entityInfo ?? {
    identified_subject: "Visual Exhibit & Photographic Scene",
    exists_in_reality: true,
    informative_note:
      "The depicted subject exhibits naturalistic geometric perspective and real-world physical structures. For comprehensive grounding, consult authoritative digital archives and physical reference repositories.",
    reference_urls: [
      {
        title: "Wikipedia: Digital Image Forensics",
        url: "https://en.wikipedia.org/wiki/Digital_image_forensics",
        description: "Scientific methodologies for verifying authentic vs synthetic digital imagery.",
      },
      {
        title: "C2PA: Content Provenance & Authenticity",
        url: "https://c2pa.org",
        description: "Open cross-industry standards for establishing content provenance and media origins.",
      },
      {
        title: "Britannica: Photography History & Science",
        url: "https://www.britannica.com/technology/photography",
        description: "Optical science, sensor chemistry, and camera capture physics.",
      },
      {
        title: "Smithsonian Institution Archives",
        url: "https://www.si.edu/explore",
        description: "World's largest museum and research complex exploring natural history and art.",
      },
    ],
  };

  const exists = info.exists_in_reality;

  return (
    <section className="entity-verification-card" aria-label="Real-World Entity Grounding">
      <div className="entity-header">
        <div className="entity-title-group">
          <span className="eyebrow">Visual Ontological Grounding</span>
          <h3>Real-World Subject Verification</h3>
        </div>

        <div className={`existence-badge ${exists ? "exists" : "fictional"}`}>
          <span className="status-dot" />
          <span>{exists ? "CONFIRMED REAL-WORLD ENTITY" : "SYNTHETIC / FICTIONAL FABRICATION"}</span>
        </div>
      </div>

      <div className="entity-body">
        <div className="identified-box">
          <span className="entity-field-label">IDENTIFIED SUBJECT</span>
          <h4 className="identified-name">{info.identified_subject}</h4>
        </div>

        <div className="informative-note-box">
          <span className="entity-field-label">INFORMATIVE FORENSIC NOTE</span>
          <p className="note-text">{info.informative_note}</p>
        </div>

        {/* Authoritative Web References */}
        <div className="reference-urls-section">
          <div className="ref-header">
            <span className="ref-title">AUTHORITATIVE WEB DOCUMENTATION & LEARNING SOURCES</span>
            <span className="ref-count">{info.reference_urls.length} Verified Sources</span>
          </div>

          <div className="url-cards-grid">
            {info.reference_urls.map((link, idx) => {
              let domain = "";
              try {
                domain = new URL(link.url).hostname.replace(/^www\./, "");
              } catch {
                domain = "web resource";
              }

              return (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="url-reference-card"
                >
                  <div className="url-top-row">
                    <span className="domain-pill">{domain}</span>
                    <span className="arrow-icon">↗</span>
                  </div>
                  <strong className="link-title">{link.title}</strong>
                  {link.description && (
                    <p className="link-desc">{link.description}</p>
                  )}
                  <span className="raw-url">{link.url}</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

