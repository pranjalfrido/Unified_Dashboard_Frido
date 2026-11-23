// Shared look for the CN screens: page size, number format and table cell styles.
import { C } from "../utils.js";

export const PAGE = 100;
export const fmt = (n) => Number(n ?? 0).toLocaleString("en-IN");
export const btn = { display: "inline-flex", alignItems: "center", gap: 6 };
export const th = { position: "sticky", top: 0, background: C.ach, textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
export const td = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", fontSize: 12.5 };
export const num = { ...td, textAlign: "right", fontFamily: "monospace" };
