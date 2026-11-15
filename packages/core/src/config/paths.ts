import path from "path";

/** Where the engine reads and writes on local disk. */
export interface EnginePaths {
  /** Originals when no storage bucket is configured. */
  public: string;
  /** Transformed derivatives kept on local disk. */
  cache: string;
  /** Originals staged for sharp/ffmpeg while a transform runs. */
  temp: string;
}

/** public/, cache/ and temp/ under `root`, as the Docker images lay them out. */
export const enginePathsIn = (root: string): EnginePaths => ({
  public: path.join(root, "public"),
  cache: path.join(root, "cache"),
  temp: path.join(root, "temp"),
});
