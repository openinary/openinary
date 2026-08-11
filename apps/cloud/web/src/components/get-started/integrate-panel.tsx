"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, KeyRound } from "lucide-react";

import {
  CopyPromptButton,
  useAiPrompt,
} from "@/components/get-started/prompt-copy";
import { useSettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackIntegrationDocsOpened } from "@/lib/analytics";
import { orpc } from "@/utils/orpc";

/**
 * The framework walkthroughs live in the docs, where they can be as long as
 * they need to be and are maintained next to the component itself. The prompt
 * stays here because it is the one thing that has to be prefilled with this
 * account's bucket, and it is written to be pasted into an agent whole.
 */
function NextjsLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.5725 0c-.1763 0-.3098.0013-.3584.0067-.0516.0053-.2159.021-.3636.0328-3.4088.3073-6.6017 2.1463-8.624 4.9728C1.1004 6.584.3802 8.3666.1082 10.255c-.0962.659-.108.8537-.108 1.7474s.012 1.0884.108 1.7476c.652 4.506 3.8591 8.2919 8.2087 9.6945.7789.2511 1.6.4223 2.5337.5255.3636.04 1.9354.04 2.299 0 1.6117-.1783 2.9772-.577 4.3237-1.2643.2065-.1056.2464-.1337.2183-.1573-.0188-.0139-.8987-1.1938-1.9543-2.62l-1.919-2.592-2.4047-3.5583c-1.3231-1.9564-2.4117-3.556-2.4211-3.556-.0094-.0026-.0187 1.5787-.0235 3.509-.0067 3.3802-.0093 3.5162-.0516 3.596-.061.115-.108.1618-.2064.2134-.075.0374-.1408.0445-.495.0445h-.406l-.1078-.068a.4383.4383 0 0 1-.1572-.1712l-.0493-.1056.0053-4.703.0067-4.7054.0726-.0915c.0376-.0493.1174-.1125.1736-.1408.0962-.047.1338-.0517.5396-.0517.4787 0 .5584.0187.6827.1547.0353.0377 1.3373 1.9987 2.895 4.3608a10760.433 10760.433 0 0 0 4.7344 7.1706l1.9002 2.8782.0963-.0633c.8518-.5536 1.7525-1.3418 2.4657-2.1627 1.5179-1.7429 2.4963-3.868 2.8247-6.134.0961-.6591.1078-.854.1078-1.7475 0-.8937-.012-1.0884-.1078-1.7476-.6522-4.506-3.8592-8.2919-8.2087-9.6945-.7672-.2487-1.5836-.42-2.4985-.5232-.169-.0176-1.0835-.0366-1.6123-.037zm4.0685 7.217c.3473 0 .4082.0053.4857.047.1127.0562.204.1642.237.2767.0186.061.0234 1.3653.0186 4.3044l-.0067 4.2175-.7436-1.14-.7461-1.1401v-3.066c0-1.9822.0093-3.0963.0234-3.1502.0375-.1313.1196-.2346.2323-.2955.0961-.0494.1313-.0546.4997-.0546z" />
    </svg>
  );
}

function ReactLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="-11.5 -10.23174 23 20.46348"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle fill="#61DAFB" r="2.05" />
      <g fill="none" stroke="#61DAFB" strokeWidth="1">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
}

const GUIDES: {
  id: "nextjs" | "react";
  label: string;
  href: string;
  Logo: (props: { className?: string }) => React.ReactNode;
}[] = [
  {
    id: "nextjs",
    label: "Next.js",
    href: "https://docs.openinary.dev/guides/integrate/nextjs",
    Logo: NextjsLogo,
  },
  {
    id: "react",
    label: "React",
    href: "https://docs.openinary.dev/guides/integrate/react",
    Logo: ReactLogo,
  },
];

export function IntegratePanel() {
  const [, setSettingsTab] = useSettingsDialog();

  const { data: keys } = useQuery(orpc.apiKey.list.queryOptions());
  const content = useAiPrompt();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-sm">AI prompt</p>
        <div className="flex items-center gap-2">
          <Button
            className="h-7 text-xs"
            onClick={() => setSettingsTab("api-keys")}
            size="sm"
            variant="outline"
          >
            <KeyRound className="size-3.5" />
            {keys?.length ? "Manage keys" : "Create an API key"}
          </Button>
          <CopyPromptButton />
        </div>
      </div>

      {content ? (
        <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-[11px] leading-relaxed">
          <code>{content}</code>
        </pre>
      ) : (
        <Skeleton className="h-64 w-full" />
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Prefilled with your bucket and delivery URL, but never with your API key
        - Openinary keys mint upload signatures, so they have to stay on your
        server. Create one above and paste it into your backend's
        <code className="mx-1 font-mono">.env</code> as
        <code className="mx-1 font-mono">OPENINARY_API_KEY</code> while your
        agent writes the rest.
      </p>

      <div className="space-y-2 border-t pt-4">
        <p className="font-medium text-sm">Rather do it by hand?</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          The same integration, written out step by step - the registry, the
          signing route, the uploader, and how to render what comes back.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {GUIDES.map((guide) => (
            <Button
              asChild
              className="h-7 text-xs"
              key={guide.id}
              size="sm"
              variant="outline"
            >
              <a
                href={guide.href}
                onClick={() => trackIntegrationDocsOpened(guide.id)}
                rel="noreferrer"
                target="_blank"
              >
                <guide.Logo className="size-3.5" />
                {guide.label}
                <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
