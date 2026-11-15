import { Config } from "@remotion/cli/config";

// Applies to `remotion render` / `remotion studio`. CLI flags override these.
Config.setVideoImageFormat("jpeg"); // jpeg frames are much faster than png; use png only when rendering alpha
Config.setJpegQuality(95);
Config.setCodec("h264");
Config.setCrf(16);
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709"); // without this, jpeg frames give yuvj420p full-range + bt470bg tags
Config.setX264Preset("slow");
Config.setAudioCodec("aac");
Config.setAudioBitrate("320k");
Config.setConcurrency(4); // GPU-bound on M3 Pro: 3-4 is the sweet spot, more is slower. See analysis/tooling.md
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle"); // GPU-backed canvas/WebGL (needed for @remotion/effects, filters)
