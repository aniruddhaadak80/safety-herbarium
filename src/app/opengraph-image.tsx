import { ImageResponse } from "next/og";

export const alt = "Safety Herbarium — a mounted sheet of AI-safety literature";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The OpenGraph card.
 *
 * Rendered at build time from the same constants the app uses, so the card cannot
 * claim something the product does not do.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4efe4",
          color: "#23201a",
          padding: 64,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 16, height: 16, background: "#2f4f3a" }} />
          <div
            style={{
              fontSize: 22,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "monospace",
              color: "#7d7466",
            }}
          >
            AI safety · alignment · open access
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Safety Herbarium
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 40,
              fontStyle: "italic",
              color: "#2f4f3a",
            }}
          >
            Mount the literature. See what you are missing.
          </div>
          <div style={{ marginTop: 26, fontSize: 26, color: "#4a4438", maxWidth: 940, lineHeight: 1.4 }}>
            Live arXiv papers and open-access safety textbooks, mounted into a reading volume and
            graded by a deterministic coverage engine with a replayable SHA-384 audit chain.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #d8cbb2",
            paddingTop: 20,
            fontSize: 20,
            fontFamily: "monospace",
            color: "#7d7466",
          }}
        >
          <span>10 risk classes · herbarium-grade/1.0.0</span>
          <span>github.com/aniruddhaadak80/safety-herbarium</span>
        </div>
      </div>
    ),
    size,
  );
}