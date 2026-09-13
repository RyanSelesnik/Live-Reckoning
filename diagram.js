const figure = document.querySelector("#system-figure");
const buttons = [...document.querySelectorAll("[data-focus-button]")];
const sensorTargets = [...document.querySelectorAll("[data-sensor]")];

function setFocus(nextFocus) {
  figure.dataset.focus = nextFocus;

  for (const button of buttons) {
    const active = button.dataset.focusButton === nextFocus;
    button.setAttribute("aria-pressed", String(active));
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => setFocus(button.dataset.focusButton));
}

for (const target of sensorTargets) {
  const selectSensor = () => setFocus(target.dataset.sensor);
  target.addEventListener("click", selectSensor);
  target.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectSensor();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setFocus("all");
  }
});
