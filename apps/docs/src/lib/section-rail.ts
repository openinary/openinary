import type { Breadcrumb, SidebarItem } from "@cloudflare/nimbus-docs/types";
import { stripBase } from "@cloudflare/nimbus-docs/runtime";

/** The sidebar's two top-level groups, which the header's Docs menu opens. */
const SECTIONS: Record<string, string> = { Documentation: "/", "API Reference": "/api-reference/" };

const holdsCurrent = (item: SidebarItem): boolean =>
  item.type === "link" ? Boolean(item.isCurrent) : item.type === "group" && item.children.some(holdsCurrent);

/**
 * The rail: the whole section the page is in (Documentation or the API
 * reference), every group of it, without the section's own heading, which
 * the header's Docs menu already names. Pass it the full tree.
 */
export function sectionRail(tree: SidebarItem[]): SidebarItem[] {
  const sections = tree.filter((item) => item.type === "group" && item.label in SECTIONS);
  const section = sections.find(holdsCurrent) ?? sections[0];
  return section?.type === "group" ? section.children : tree;
}

/** The first page a group leads to, as a path without the /docs base. */
function firstPage(items: SidebarItem[]): string | undefined {
  for (const item of items) {
    if (item.type === "link") return stripBase(item.href, import.meta.env.BASE_URL);
    if (item.type === "group") {
      const href = firstPage(item.children);
      if (href) return href;
    }
  }
  return undefined;
}

function findGroup(items: SidebarItem[], label: string): SidebarItem | undefined {
  for (const item of items) {
    if (item.type !== "group") continue;
    if (item.label === label) return item;
    const found = findGroup(item.children, label);
    if (found) return found;
  }
  return undefined;
}

/**
 * Breadcrumbs where every step is a link: a section goes to its first page,
 * a group to its first page. "Home" goes: the section names the same place.
 */
export function linkedCrumbs(crumbs: Breadcrumb[], tree: SidebarItem[]): Breadcrumb[] {
  return crumbs
    .filter((_, i) => !(i === 0 && crumbs[1]?.label in SECTIONS))
    .map((crumb) => {
      if (crumb.href) return crumb;
      if (crumb.label in SECTIONS) return { ...crumb, href: SECTIONS[crumb.label] };
      const group = findGroup(tree, crumb.label);
      const href = group?.type === "group" ? firstPage(group.children) : undefined;
      return href ? { ...crumb, href } : crumb;
    });
}
