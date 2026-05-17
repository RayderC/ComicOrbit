"use client";

import { useState } from "react";

export default function DescriptionExpander({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="series-detail-description">
      <p className={`desc-text${expanded ? " desc-expanded" : " desc-clamped"}`}>{text}</p>
      <button className="desc-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Show less" : "Read more…"}
      </button>
    </div>
  );
}
