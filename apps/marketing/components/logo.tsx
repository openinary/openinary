"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { LogoMark } from "@/components/logo-mark";
import type { AnimationName } from "@/components/kirby";

/**
 * Moods the mark cycles through.
 *
 * A subset of what Kirby can do: the logo is the first thing on the page and
 * should read as friendly, so the sulking end of the range (angry, sad,
 * scared, bored) stays out of it.
 */
const MOODS: AnimationName[] = [
  "idle",
  "curious",
  "happy",
  "thinking",
  "playful",
  "excited",
  "proud",
  "surprised",
  "laughing",
];

/** Three to ten seconds on a mood, redrawn for every change. */
const SETTLE_MS = 3000;
const DRIFT_MS = 7000;

/** Fisher-Yates, on a copy: MOODS is module state and outlives the component. */
function shuffle(moods: AnimationName[]): AnimationName[] {
  const bag = [...moods];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/**
 * The engine ships as ~58KB of inlined source that builds itself into a Blob
 * at runtime, so it loads as its own chunk rather than riding along with the
 * page. Until it lands, and for anyone the script never reaches, the drawn
 * mark is what shows: same size, same place, so nothing moves when it swaps.
 */
const Kirby = dynamic(
  () => import("@/components/kirby").then((module) => module.Kirby),
  { ssr: false, loading: () => <LogoMark /> },
);

/** Pause after a wink finishes before a fresh hover can start another. */
const WINK_COOLDOWN_MS = 2000;

function AnimatedMark({
  winking,
  onWinkEnd,
}: {
  winking: boolean;
  onWinkEnd: () => void;
}) {
  // Drawn at random on the first frame rather than always opening on idle.
  // A fixed opening mood was the only one most visits ever reached, so every
  // load looked identical however random the rest of it was. Safe to draw
  // during render: the avatar is client only, and the still mark the server
  // sends in its place takes no animation, so there is nothing to mismatch.
  const [animation, setAnimation] = React.useState<AnimationName>(
    () => MOODS[Math.floor(Math.random() * MOODS.length)],
  );

  // A bag rather than a fresh draw each time: picking independently lets the
  // same two moods trade places for a minute, which reads as broken rather
  // than as random. Every mood plays once before any plays twice, in an order
  // reshuffled per refill.
  const bag = React.useRef<AnimationName[]>([]);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const take = (current: AnimationName) => {
      if (bag.current.length === 0) {
        const refill = shuffle(MOODS);
        // A refill must not open on the mood already playing, or the change
        // would be invisible.
        if (refill[0] === current) {
          [refill[0], refill[refill.length - 1]] = [
            refill[refill.length - 1],
            refill[0],
          ];
        }
        bag.current = refill;
      }
      return bag.current.shift() as AnimationName;
    };

    let timer = 0;
    const drift = () => {
      timer = window.setTimeout(
        () => {
          setAnimation(take);
          drift();
        },
        // Redrawn every time, not once: a single delay reused would put the
        // changes on a metronome, which reads as a loading spinner rather
        // than as something with a mood.
        SETTLE_MS + Math.random() * DRIFT_MS,
      );
    };

    drift();
    return () => window.clearTimeout(timer);
  }, []);

  // The wink overrides the mood rather than replacing it: the drift keeps
  // ticking underneath, so the end of a wink lands on whatever mood the mark
  // would have had anyway instead of restarting the cycle.
  //
  // Its data declares playbackMode "once", so the engine stops it by itself
  // and says so; the moods loop and never fire onAnimationEnd.
  return (
    <Kirby
      animation={winking ? "wink" : animation}
      onAnimationEnd={(ended) => {
        if (ended === "wink") onWinkEnd();
      }}
      size={30}
    />
  );
}

/**
 * Wordmark only. It used to share one viewBox with the mark; the mark is a DOM
 * element now, so the type is cropped out of the original artwork rather than
 * redrawn: same glyphs, same 0.2885 scale the 417 unit lockup was rendered at.
 */
function Wordmark() {
  return (
    <svg
      width="85"
      height="17"
      viewBox="122 27 294 58"
      fill="currentColor"
      className="text-foreground"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M144.014 76.0504C139.418 76.0504 135.457 75.0875 132.131 73.1617C128.804 71.1921 126.244 68.3909 124.449 64.7581C122.698 61.1253 121.823 56.7922 121.823 51.7588C121.823 46.7254 122.698 42.3923 124.449 38.7595C126.244 35.083 128.804 32.2599 132.131 30.2903C135.457 28.3207 139.418 27.3359 144.014 27.3359C148.697 27.3359 152.68 28.3207 155.963 30.2903C159.289 32.2599 161.828 35.083 163.578 38.7595C165.373 42.3923 166.27 46.7254 166.27 51.7588C166.27 56.7922 165.373 61.1253 163.578 64.7581C161.828 68.3909 159.289 71.1921 155.963 73.1617C152.68 75.0875 148.697 76.0504 144.014 76.0504ZM144.014 68.6317C146.859 68.6317 149.266 67.9751 151.236 66.6621C153.249 65.3052 154.781 63.3794 155.831 60.8846C156.926 58.346 157.473 55.3041 157.473 51.7588C157.473 48.2136 156.926 45.1717 155.831 42.6331C154.781 40.0945 153.249 38.1468 151.236 36.79C149.266 35.4331 146.859 34.7547 144.014 34.7547C141.256 34.7547 138.871 35.4331 136.858 36.79C134.844 38.1468 133.29 40.0945 132.196 42.6331C131.146 45.1717 130.621 48.2136 130.621 51.7588C130.621 55.3041 131.146 58.346 132.196 60.8846C133.29 63.3794 134.844 65.3052 136.858 66.6621C138.871 67.9751 141.256 68.6317 144.014 68.6317ZM170.386 84.8479V39.9413H178.462L178.659 47.4257L177.805 47.0318C178.68 44.4495 180.103 42.5018 182.073 41.1887C184.086 39.8319 186.427 39.1535 189.097 39.1535C192.424 39.1535 195.181 39.9851 197.37 41.6483C199.602 43.3115 201.265 45.5218 202.359 48.2792C203.454 51.0367 204.001 54.1005 204.001 57.4707C204.001 60.8408 203.432 63.9046 202.294 66.6621C201.199 69.4195 199.536 71.6298 197.304 73.293C195.116 74.9562 192.358 75.7878 189.032 75.7878C187.281 75.7878 185.64 75.4815 184.108 74.8687C182.62 74.2559 181.328 73.3806 180.234 72.2426C179.184 71.1046 178.44 69.7696 178.002 68.2377L178.79 67.5812V84.8479H170.386ZM187.062 68.9599C189.601 68.9599 191.592 67.9532 193.037 65.9399C194.525 63.8828 195.269 61.0597 195.269 57.4707C195.269 53.8816 194.525 51.0804 193.037 49.0671C191.592 47.0099 189.601 45.9814 187.062 45.9814C185.355 45.9814 183.889 46.4191 182.663 47.2944C181.438 48.126 180.475 49.3953 179.775 51.1023C179.118 52.8093 178.79 54.9321 178.79 57.4707C178.79 60.0092 179.118 62.132 179.775 63.839C180.431 65.546 181.372 66.8371 182.598 67.7125C183.867 68.5441 185.355 68.9599 187.062 68.9599ZM222.405 75.7878C218.903 75.7878 215.862 75.0438 213.279 73.5556C210.697 72.0237 208.705 69.8791 207.305 67.1216C205.904 64.3642 205.204 61.1472 205.204 57.4707C205.204 53.7941 205.904 50.599 207.305 47.8853C208.705 45.1279 210.675 42.9832 213.214 41.4513C215.796 39.9194 218.794 39.1535 222.208 39.1535C225.534 39.1535 228.445 39.8975 230.94 41.3857C233.478 42.8738 235.426 45.0185 236.783 47.8197C238.14 50.6209 238.818 53.991 238.818 57.9302V59.8342H213.936C214.111 62.898 214.942 65.2177 216.431 66.7934C217.962 68.3253 219.976 69.0912 222.471 69.0912C224.353 69.0912 225.906 68.6754 227.132 67.8438C228.401 66.9685 229.277 65.7648 229.758 64.2329L238.359 64.7581C237.396 68.1721 235.492 70.8639 232.647 72.8335C229.846 74.803 226.432 75.7878 222.405 75.7878ZM213.936 54.188H230.152C229.977 51.343 229.167 49.2421 227.723 47.8853C226.279 46.4847 224.44 45.7844 222.208 45.7844C219.976 45.7844 218.116 46.5066 216.628 47.951C215.183 49.3953 214.286 51.4743 213.936 54.188ZM242.104 75V39.9413H249.72L250.048 49.7893L249.064 49.3953C249.414 46.9443 250.136 44.9747 251.23 43.4866C252.324 41.9984 253.659 40.9042 255.235 40.2039C256.811 39.5036 258.54 39.1535 260.422 39.1535C263.004 39.1535 265.171 39.7225 266.921 40.8604C268.716 41.9984 270.073 43.5741 270.992 45.5875C271.911 47.5571 272.371 49.8549 272.371 52.481V75H263.967V55.1728C263.967 53.2032 263.77 51.54 263.376 50.1832C262.982 48.8263 262.326 47.7978 261.406 47.0975C260.531 46.3534 259.349 45.9814 257.861 45.9814C255.629 45.9814 253.834 46.7692 252.478 48.3449C251.165 49.9206 250.508 52.1965 250.508 55.1728V75H242.104ZM277.675 75V39.9413H286.079V75H277.675ZM277.544 35.2799V27.7955H286.276V35.2799H277.544ZM292.537 75V39.9413H300.152L300.481 49.7893L299.496 49.3953C299.846 46.9443 300.568 44.9747 301.662 43.4866C302.757 41.9984 304.092 40.9042 305.667 40.2039C307.243 39.5036 308.972 39.1535 310.854 39.1535C313.436 39.1535 315.603 39.7225 317.354 40.8604C319.148 41.9984 320.505 43.5741 321.424 45.5875C322.343 47.5571 322.803 49.8549 322.803 52.481V75H314.399V55.1728C314.399 53.2032 314.202 51.54 313.808 50.1832C313.414 48.8263 312.758 47.7978 311.839 47.0975C310.963 46.3534 309.782 45.9814 308.293 45.9814C306.061 45.9814 304.267 46.7692 302.91 48.3449C301.597 49.9206 300.94 52.1965 300.94 55.1728V75H292.537ZM338.091 75.7878C334.415 75.7878 331.46 74.9562 329.228 73.293C326.996 71.586 325.88 69.2225 325.88 66.2025C325.88 63.1825 326.821 60.819 328.703 59.112C330.585 57.405 333.452 56.1795 337.303 55.4354L348.924 53.1376C348.924 50.6427 348.355 48.7826 347.217 47.5571C346.079 46.2878 344.394 45.6531 342.162 45.6531C340.148 45.6531 338.551 46.1346 337.369 47.0975C336.231 48.0166 335.443 49.3516 335.006 51.1023L326.471 50.7084C327.171 46.9881 328.878 44.1431 331.592 42.1735C334.305 40.1601 337.829 39.1535 342.162 39.1535C347.151 39.1535 350.915 40.4228 353.454 42.9613C356.036 45.4562 357.328 49.0452 357.328 53.7284V66.4651C357.328 67.3843 357.481 68.0189 357.787 68.369C358.137 68.7192 358.641 68.8943 359.297 68.8943H360.413V75C360.151 75.0875 359.713 75.1532 359.1 75.197C358.531 75.2407 357.94 75.2626 357.328 75.2626C355.883 75.2626 354.592 75.0438 353.454 74.6061C352.316 74.1246 351.441 73.3149 350.828 72.1769C350.215 70.9952 349.909 69.3976 349.909 67.3843L350.631 67.9095C350.281 69.4414 349.515 70.8201 348.333 72.0456C347.195 73.2274 345.751 74.1465 344 74.803C342.249 75.4596 340.28 75.7878 338.091 75.7878ZM339.798 69.6821C341.68 69.6821 343.3 69.3101 344.656 68.566C346.013 67.8219 347.064 66.7934 347.808 65.4803C348.552 64.1673 348.924 62.6135 348.924 60.819V58.8494L339.864 60.6876C337.982 61.0816 336.625 61.6724 335.793 62.4603C335.006 63.2043 334.612 64.1891 334.612 65.4147C334.612 66.7715 335.049 67.8219 335.925 68.566C336.844 69.3101 338.135 69.6821 339.798 69.6821ZM362.588 75V39.9413H370.466L370.795 49.6579L370.072 49.5266C370.598 46.1565 371.582 43.7273 373.027 42.2392C374.515 40.7073 376.528 39.9413 379.067 39.9413H382.284V47.1631H379.001C377.207 47.1631 375.719 47.4257 374.537 47.951C373.355 48.4762 372.458 49.3078 371.845 50.4458C371.276 51.54 370.992 52.9844 370.992 54.7789V75H362.588ZM387.125 84.8479V78.3483H391.59C392.728 78.3483 393.559 78.1732 394.084 77.8231C394.653 77.4729 395.091 76.8821 395.398 76.0504L396.382 73.6213H393.953L381.413 39.9413H390.145L398.943 65.7429L407.346 39.9413H416.078L402.357 78.6766C401.569 80.865 400.453 82.4407 399.008 83.4036C397.608 84.3665 395.638 84.8479 393.1 84.8479H387.125Z" />
    </svg>
  );
}

export default function Logo() {
  // On the lockup, not the mark: the header link wraps the whole logo, so the
  // wink should greet a pointer resting anywhere on it, wordmark included.
  //
  // A greeting, not a hover state, so entering only ever arms it and leaving
  // is ignored: once started it plays out whatever the pointer does, flicking
  // across cannot cut it short or restart it, and staying put does not loop
  // it. It rearms when the engine reports the wink finished plus a pause.
  const [winking, setWinking] = React.useState(false);
  const armedAt = React.useRef(0);

  return (
    <span
      className="inline-flex items-center gap-1.5 align-middle"
      onMouseEnter={() => {
        if (Date.now() >= armedAt.current) setWinking(true);
      }}
    >
      <AnimatedMark
        winking={winking}
        onWinkEnd={() => {
          armedAt.current = Date.now() + WINK_COOLDOWN_MS;
          setWinking(false);
        }}
      />
      <Wordmark />
    </span>
  );
}
