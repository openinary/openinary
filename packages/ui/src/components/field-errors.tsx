"use client";

import { useEffect } from "react";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isField = (target: EventTarget | null): target is Field =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement;

/** What is wrong and what to do about it, in a short plain sentence. */
function message(field: Field): string {
  const v = field.validity;
  if (v.valueMissing) {
    if (field instanceof HTMLInputElement && field.type === "checkbox")
      return "Tick this to carry on.";
    if (
      field instanceof HTMLSelectElement ||
      (field instanceof HTMLInputElement && field.type === "radio")
    )
      return "Choose one.";
    return "Fill this in.";
  }
  if (v.typeMismatch && field.type === "email")
    return "That doesn't look like an email address.";
  if (v.typeMismatch && field.type === "url")
    return "That isn't a web address. Use one like https://example.com.";
  if (v.tooShort)
    return `Use at least ${field.getAttribute("minlength")} characters.`;
  if (v.tooLong)
    return `Use at most ${field.getAttribute("maxlength")} characters.`;
  if (v.rangeUnderflow) return `Use ${field.getAttribute("min")} or more.`;
  if (v.rangeOverflow) return `Use ${field.getAttribute("max")} or less.`;
  if (v.patternMismatch && field.title) return field.title;
  return field.validationMessage || "That doesn't look right.";
}

function clear(field: Field) {
  delete field.dataset.invalid;
  field.removeAttribute("aria-invalid");
  const next = field.nextElementSibling;
  if (next instanceof HTMLElement && "fieldError" in next.dataset) next.remove();
}

/**
 * Replaces the browser's validation bubbles, for every form in the app: the
 * message goes under the field, the field takes a red ring, and the first one
 * that is wrong shakes and takes focus. The error leaves as soon as the field
 * is valid again. Forms only need the native attributes (required, type,
 * minlength, ...). Mount once, at the root.
 */
export function FieldErrors() {
  useEffect(() => {
    let lastShake = 0;

    const onInvalid = (event: Event) => {
      const field = event.target;
      if (!isField(field)) return;
      event.preventDefault();
      clear(field);
      field.dataset.invalid = "true";
      field.setAttribute("aria-invalid", "true");
      const error = document.createElement("p");
      error.className = "ds-field-error";
      error.dataset.fieldError = "";
      error.setAttribute("role", "alert");
      error.textContent = message(field);
      field.after(error);

      // `invalid` fires on every bad field of the form, in order: only the
      // first one of a submit shakes and takes focus.
      const now = performance.now();
      if (now - lastShake < 300) return;
      lastShake = now;
      field.classList.remove("ds-shake");
      void field.offsetWidth;
      field.classList.add("ds-shake");
      field.focus();
    };

    const onEdit = (event: Event) => {
      const field = event.target;
      if (isField(field) && field.dataset.invalid && field.validity.valid)
        clear(field);
    };

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
    };
  }, []);

  return null;
}
