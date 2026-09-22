const figure = document.querySelector("#system-figure");
const slot = document.querySelector("#system-diagram-slot");
const buttons = [...document.querySelectorAll("[data-focus-button]")];
let diagram = null;

function setFocus(nextFocus) {
  figure.dataset.focus = nextFocus;
  if (diagram) diagram.dataset.focus = nextFocus;

  for (const button of buttons) {
    const active = button.dataset.focusButton === nextFocus;
    button.setAttribute("aria-pressed", String(active));
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => setFocus(button.dataset.focusButton));
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setFocus("all");
});

async function loadDiagram() {
  try {
    const response = await fetch(slot.dataset.src, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const source = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
    if (source.querySelector("parsererror") || source.documentElement.localName !== "svg") {
      throw new Error("Invalid SVG");
    }

    diagram = document.importNode(source.documentElement, true);
    slot.replaceChildren(diagram);

    for (const sensor of ["imu", "camera"]) {
      const target = diagram.querySelector(`#${sensor}-layer`);
      if (!target) continue;
      target.setAttribute("role", "button");
      target.setAttribute("tabindex", "0");
      target.setAttribute("aria-label", `Highlight ${sensor} measurement path`);
      target.addEventListener("click", () => setFocus(sensor));
      target.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setFocus(sensor);
        }
      });
    }

    setFocus(figure.dataset.focus);
  } catch (error) {
    console.error("Unable to load system diagram:", error);
  }
}

loadDiagram();
