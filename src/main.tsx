import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { BASE_URL } from "./data/publicPaths";
import "./styles/tokens.css";
import "./styles/global.css";

document.documentElement.style.setProperty(
  "--journal-stickers-url",
  `url("${BASE_URL}ui-assets/journal-stickers.png")`,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
