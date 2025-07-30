export const parseParams = (path: string) => {
  const segments = path.split('/');
  const params: Record<string, string> = {};

  segments.forEach((segment) => {
    if (segment.includes(':')) {
      const [key, value] = segment.split(':');
      params[key] = value;
    }
  });

  return params;
};
