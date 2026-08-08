import path from "path";

/**
 * Generates a unique file path by appending suffixes (1), (2), (3), ...
 * when a given path already exists.
 *
 * A "duplicate" is defined as the same full path (folders + filename).
 */
export async function getUniqueFilePath(
  originalPath: string,
  exists: (filePath: string) => Promise<boolean>,
  maxAttempts: number = 100
): Promise<string> {
  // Start by checking the original path
  if (!(await exists(originalPath))) {
    return originalPath;
  }

  const dir = path.posix.dirname(originalPath);
  const baseName = path.posix.basename(originalPath);
  const ext = path.posix.extname(baseName);
  const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName;

  for (let i = 1; i <= maxAttempts; i++) {
    const candidateName = `${nameWithoutExt} (${i})${ext}`;
    const candidatePath =
      dir === "." ? candidateName : `${dir}/${candidateName}`;

    if (!(await exists(candidatePath))) {
      return candidatePath;
    }
  }

  throw new Error(
    `Unable to generate unique file path after ${maxAttempts} attempts for ${originalPath}`
  );
}


