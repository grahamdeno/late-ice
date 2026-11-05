import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);

// Installable PWA: register the offline shell when allowed. Sandboxed previews throw on access, so guard it.
window.addEventListener("load", () => {
  try {
    if (location.protocol.startsWith("http") && window.self === window.top && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  } catch {
    /* service workers unavailable here */
  }
});
