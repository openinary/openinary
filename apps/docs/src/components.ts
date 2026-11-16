/**
 * MDX globals registry — components available inside MDX without `import`.
 * Wired via `<Content components={components} />` in `[...slug].astro`.
 *
 * The pages came from Mintlify, so its component names (Card, CardGroup,
 * Tab, Accordion, Note, Warning) map to thin wrappers in
 * ./components/mdx over the Nimbus components in ./components/ui.
 */

import { Aside } from "./components/ui/aside";
import Render from "./components/Render.astro";
import { AccordionGroup } from "./components/ui/accordion";
import { CardGrid } from "./components/ui/card-grid";
import { Frame } from "./components/ui/frame";
import { PackageManagers } from "./components/ui/package-managers";
import { Step, Steps } from "./components/ui/steps";
import { Tabs, TabItem } from "./components/ui/tabs";
import Accordion from "./components/mdx/Accordion.astro";
import Card from "./components/mdx/Card.astro";
import CardGroup from "./components/mdx/CardGroup.astro";
import Note from "./components/mdx/Note.astro";
import Tab from "./components/mdx/Tab.astro";
import Warning from "./components/mdx/Warning.astro";

export const components = {
  Accordion,
  AccordionGroup,
  Aside,
  Card,
  CardGrid,
  CardGroup,
  Frame,
  Note,
  PackageManagers,
  Render,
  Step,
  Steps,
  Tab,
  TabItem,
  Tabs,
  Warning,
};
