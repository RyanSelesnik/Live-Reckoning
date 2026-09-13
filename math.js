"use strict";

document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.katex === "undefined") return;

  document.querySelectorAll("[data-tex]").forEach((element) => {
    window.katex.render(element.textContent.trim(), element, {
      displayMode: element.dataset.tex === "display",
      output: "htmlAndMathml",
      strict: "warn",
      throwOnError: false,
      trust: false,
    });
  });
});
