import { mount } from "@cloudflare/nimbus-docs/client";

const RESET_MS = 1500;

function initAgentPrompt(root: HTMLElement): () => void {
  const button = root.querySelector<HTMLButtonElement>("[data-nb-agent-prompt-copy]");
  const label = root.querySelector<HTMLElement>("[data-nb-agent-prompt-label]");
  const status = root.querySelector<HTMLElement>("[data-nb-agent-prompt-status]");
  const prompt = button?.dataset.copy;
  if (!button || !label || !prompt) return () => {};

  const idle = label.textContent;
  let timer: number | undefined;
  const onCopy = async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      copied = false;
    }
    if (!root.isConnected) return;
    label.textContent = copied ? "Copied" : "Couldn't copy";
    if (status) status.textContent = copied ? "Prompt copied" : "Couldn't copy the prompt";
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      label.textContent = idle;
      if (status) status.textContent = "";
    }, RESET_MS);
  };
  button.addEventListener("click", onCopy);

  return () => {
    button.removeEventListener("click", onCopy);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

mount("[data-nb-agent-prompt]", initAgentPrompt);
