export const parseParams = (path: string) => {
  const segments = path.split('/');
  const params: Record<string, string> = {};

  segments.forEach((segment) => {
    if (segment.includes(':')) {
      const colonIndex = segment.indexOf(':');
      const key = segment.substring(0, colonIndex);
      const value = segment.substring(colonIndex + 1); // Get everything after the first colon
      params[key] = value;
    }
  });

  return params;
};
