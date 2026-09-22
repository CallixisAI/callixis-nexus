// Dashboard tiles plan §B.3 — moved verbatim from Dashboard.tsx:40-46. Shared by every recharts
// tile in src/components/dashboard/tiles.tsx so the tooltip styling stays identical across all
// three chart tiles instead of being redefined per-tile.
export const tooltipStyle = {
  backgroundColor: "hsl(220, 18%, 10%)",
  border: "1px solid hsl(220, 14%, 18%)",
  borderRadius: "10px",
  color: "hsl(210, 20%, 92%)",
  fontSize: "12px",
};
