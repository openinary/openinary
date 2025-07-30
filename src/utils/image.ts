import sharp from 'sharp';

export const transformImage = async (inputPath: string, params: any) => {
  const image = sharp(inputPath);

  if (params.resize) {
    const [w, h] = params.resize.split('x');
    image.resize(parseInt(w), parseInt(h));
  }

  if (params.quality) {
    image.jpeg({ quality: parseInt(params.quality) });
  }

  return await image.toBuffer();
};
