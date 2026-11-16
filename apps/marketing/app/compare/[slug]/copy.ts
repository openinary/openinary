/**
 * The words around each comparison table: where the two differ, and an honest
 * "choose them if". Facts about the other product stay general on purpose
 * (what it is known for, how it is sold); plan figures live in
 * data/competitors.json with the rest of the table.
 */
export type CompareCopy = {
  question: string;
  difference: string;
  chooseThem: string[];
  chooseUs: string[];
  faqs: { question: string; answer: string }[];
};

const ownIt = "You want the engine in the open: AGPL-3.0, on GitHub, nothing held back for a paid tier.";
const cloudThenSelf = "You want a free plan on Cloud now and the option to run the same engine yourself later.";

export const compareCopy: Record<string, CompareCopy> = {
  cloudinary: {
    question: "Which fits your media?",
    difference:
      "Both upload, transform and deliver images and video from URLs. Cloudinary is a closed platform billed in credits, with a large suite around it: asset management, AI editing and many SDKs. Openinary keeps to the media pipeline, is open source, and runs either on our Cloud or on your server with your own bucket. Its URL syntax is close to Cloudinary's, so most links move one to one.",
    chooseThem: [
      "You need a full digital asset management suite, with review and approval flows.",
      "You lean on its AI editing, like background removal or generative fill.",
      "You want an official SDK for almost every language and framework.",
    ],
    chooseUs: [
      "Your bill is mostly transformations and delivery, and credits make it hard to predict.",
      "You want your originals in a bucket you own, readable without us.",
      ownIt,
    ],
    faqs: [
      {
        question: "Do my Cloudinary URLs keep working?",
        answer:
          "Most do after a change of host: width, height, crop, gravity, quality and format use the same letters. The migration guide in the docs lists what maps and what doesn't.",
      },
      {
        question: "Can I move my files without downtime?",
        answer:
          "Yes. Copy your originals into a bucket Openinary reads, switch URLs page by page, and keep Cloudinary serving the rest until you're done.",
      },
    ],
  },
  imagekit: {
    question: "Which fits your images?",
    difference:
      "Both resize, crop and convert images from the URL and serve them from a CDN. ImageKit is a hosted service with a media library and a bandwidth-based free tier. Openinary is open source and runs on our Cloud or on your own server, reading from the S3-compatible bucket you choose.",
    chooseThem: [
      "You want a hosted media library your whole team works in.",
      "Its bandwidth-based free tier fits how you serve.",
      "You'd rather never think about the servers behind it.",
    ],
    chooseUs: [
      "You want the option to run it on your own infrastructure.",
      "You'd like video, uploads and images in one open-source engine.",
      ownIt,
    ],
    faqs: [
      {
        question: "Is the URL syntax the same?",
        answer:
          "No, ImageKit uses its own parameters. Openinary's are close to Cloudinary's, so expect to rewrite the transformation part of each URL once.",
      },
    ],
  },
  uploadcare: {
    question: "Which fits your uploads?",
    difference:
      "Uploadcare started with uploading: a widget that pulls files from many sources, then a CDN that serves them. Openinary starts with delivery: transformations from the URL for images and video, with an upload API and a React uploader alongside. Openinary is open source and can run on your own server.",
    chooseThem: [
      "Uploading from many sources, like cloud drives and social accounts, is the main job.",
      "You want a hosted widget with its own file handling built in.",
      "You'd rather never think about the servers behind it.",
    ],
    chooseUs: [
      "Transformations and video matter as much as the upload itself.",
      "You want to keep files in your own bucket.",
      ownIt,
    ],
    faqs: [
      {
        question: "Does Openinary have an upload widget?",
        answer:
          "Yes, a drop-in React component and a hook, with progress, retries and previews. It uploads straight to your instance with a signed request, so no key ships in the browser.",
      },
    ],
  },
  imgix: {
    question: "Which fits your images?",
    difference:
      "Both put a rendering layer in front of images that already live in your storage and change them from the URL. imgix is a hosted service with a deep image API and no free plan. Openinary is open source, handles video and uploads too, and runs on our Cloud or on your server.",
    chooseThem: [
      "You only need an image rendering CDN in front of storage you already run.",
      "You use its long list of image parameters.",
      "You'd rather pay for a managed service than run one.",
    ],
    chooseUs: [
      "You want a free plan, or to self-host for nothing but your servers.",
      "Video and uploads should live in the same place as images.",
      ownIt,
    ],
    faqs: [
      {
        question: "Can Openinary read the bucket imgix reads today?",
        answer:
          "Yes, if it's S3-compatible: point Openinary at it and the originals stay where they are.",
      },
    ],
  },
  thumbor: {
    question: "Which fits your stack?",
    difference:
      "Both are open source and render images on request. Thumbor is a mature Python image server you assemble with your own storage, cache and CDN. Openinary ships the whole pipeline in one container: storage connectors, video, an upload API, a dashboard and caching, or runs on our Cloud.",
    chooseThem: [
      "You only need images and already run Python services.",
      "You want to assemble storage, cache and CDN yourself.",
      "You rely on its smart cropping filters.",
    ],
    chooseUs: [
      "You want video, uploads and a dashboard in the same engine.",
      "One command should start the whole thing.",
      cloudThenSelf,
    ],
    faqs: [
      {
        question: "Are both open source?",
        answer:
          "Yes. Thumbor is under the MIT licence; Openinary is under the AGPL-3.0, which asks you to share changes if you offer a modified version as a service.",
      },
    ],
  },
  cloudimage: {
    question: "Which fits your images?",
    difference:
      "Cloudimage puts a CDN in front of images that already sit on your site and optimises them on the way out, with no upload step. Openinary also transforms from the URL, and adds uploads, video and storage in your own bucket. It's open source and can run on your server.",
    chooseThem: [
      "Your images already live on your site and you only want them lighter.",
      "You don't want to move or upload anything.",
      "You'd rather never think about the servers behind it.",
    ],
    chooseUs: [
      "You want uploads, video and images handled in one place.",
      "Originals should live in a bucket you own.",
      ownIt,
    ],
    faqs: [
      {
        question: "Do I have to upload my images to Openinary?",
        answer:
          "They need to be in the bucket Openinary reads. If they're already in S3, R2 or MinIO, point it there and nothing moves.",
      },
    ],
  },
  gumlet: {
    question: "Which fits your media?",
    difference:
      "Both optimise images and video and serve them from a CDN, reading from storage you connect. Gumlet is a hosted service with a strong focus on video hosting and streaming. Openinary is open source, transforms from the URL, and runs on our Cloud or on your own server.",
    chooseThem: [
      "Video hosting with adaptive streaming is the main job.",
      "You want a hosted video player and analytics around it.",
      "You'd rather never think about the servers behind it.",
    ],
    chooseUs: [
      "Images and short video from URLs cover what you serve.",
      "You want the option to run it on your own infrastructure.",
      ownIt,
    ],
    faqs: [
      {
        question: "Does Openinary stream adaptive video?",
        answer:
          "Not yet. It transcodes, resizes and grabs thumbnails from the URL, and tells you when a job will be ready. Adaptive streaming is on the roadmap.",
      },
    ],
  },
};
