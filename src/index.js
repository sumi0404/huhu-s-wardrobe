import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// 載入讓畫面變漂亮的 Tailwind CSS 樣式工具
const script = document.createElement("script");
script.src = "https://cdn.tailwindcss.com";
document.head.appendChild(script);

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
