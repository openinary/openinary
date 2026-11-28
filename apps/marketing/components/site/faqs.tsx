import { freeLines } from "@/components/site/plans";
import { APP_URL, DOCS_URL } from "@/components/site/ui";

/**
 * FAQ content. `text` is the plain answer for FAQPage JSON-LD, so a rich
 * `answer` and its structured-data twin are written side by side.
 */
type Faq = { question: string; answer: React.ReactNode; text: string };

const free = freeLines.join(", ");

export const homeFaqs: Faq[] = [
  {
    question: "Do I have to move my files anywhere?",
    text: "No. Self-hosted Openinary reads and writes the S3-compatible bucket you already run, S3, R2, MinIO or any other, under a prefix you choose. Openinary Cloud stores your files for you instead.",
    answer: (
      <>
        No. Self-hosted Openinary reads and writes the S3-compatible bucket you already run (S3, R2, MinIO and the
        rest) under a prefix you choose, so it can serve a bucket something else already writes to. See{" "}
        <a href={`${DOCS_URL}/configuration/storage`}>storage</a>. Openinary Cloud stores your files for you instead.
      </>
    ),
  },
  {
    question: "How does it compare to Cloudinary?",
    text: "Openinary covers the core of what Cloudinary does: URL transformations, uploads, video and edge delivery, with a close transformation syntax. It is open source under the AGPL-3.0, so you can read it, run it yourself and leave without a migration project.",
    answer: (
      <>
        It covers the core: URL transformations, uploads, video and edge delivery, with a close transformation syntax,
        so most URLs translate one to one. It is open source under the AGPL-3.0, so you can read it, run it yourself
        and leave without a migration project. The <a href={`${DOCS_URL}/migrate-from-cloudinary`}>migration guide</a>{" "}
        walks through it in five steps.
      </>
    ),
  },
  {
    question: "What does the Cloud free plan include?",
    text: `${free}, no credit card required. Pay as you go is $5 minimum usage, which includes $5 of usage every month at each resource's published price; past that, you only pay for extra usage.`,
    answer: (
      <>
        {free}, no credit card required. Pay as you go is $5 minimum usage, which includes $5 of usage every month at each
        resource's published price; past that, you only pay for extra usage.{" "}
        <a href={APP_URL}>Create your account</a> to start.
      </>
    ),
  },
  {
    question: "What does self-hosting cost?",
    text: "The software is free under the AGPL-3.0. You pay for your own server and storage. With an S3-compatible bucket like Cloudflare R2, most projects land at a few dollars a month, plus the time it takes you to run it.",
    answer:
      "The software is free under the AGPL-3.0. You pay for your own server and storage. With an S3-compatible bucket like Cloudflare R2, most projects land at a few dollars a month, plus the time it takes you to run it.",
  },
  {
    question: "Which formats does it handle?",
    text: "JPEG, PNG, WebP and AVIF images, video through FFmpeg, and audio and 3D files stored and served as originals. Transformations are driven from the URL or the API.",
    answer: (
      <>
        JPEG, PNG, WebP and AVIF images, video through FFmpeg, and audio (<code>wav</code>, <code>mp3</code>,{" "}
        <code>ogg</code>) and 3D (<code>glb</code>, <code>gltf</code>) files stored and served as originals.
        Transformations are driven from the URL or the API.
      </>
    ),
  },
  {
    question: "What if I stop using Openinary?",
    text: "Your originals are plain objects in a bucket. Self-hosted, they are already in yours. On Cloud, every original can be downloaded through the API with GET /download/{path}.",
    answer: (
      <>
        Your originals are plain objects in a bucket. Self-hosted, they are already in yours. On Cloud, every original can be downloaded
        through the <a href={`${DOCS_URL}/api-reference/files/download`}>download API</a>.
      </>
    ),
  },
];
