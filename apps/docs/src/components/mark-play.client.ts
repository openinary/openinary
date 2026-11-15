/**
 * Plays the mark's wave once per hover and lets it finish, even if the
 * pointer leaves early (same as the marketing site's MarkPlay).
 */
document.addEventListener("mouseover", (e) => {
  const link = (e.target as Element).closest?.("a");
  // Only a real entry: moving between the link's own children is not one.
  if (!link || link.contains(e.relatedTarget as Node | null)) return;
  link.querySelector(".mark")?.classList.add("mark-play");
});
document.addEventListener("animationend", (e) => {
  const piece = e.target as Element;
  if (e.animationName !== "mark-wave" || piece.nextElementSibling) return;
  piece.closest(".mark")?.classList.remove("mark-play");
});
