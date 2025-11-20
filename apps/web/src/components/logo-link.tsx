import Image from "next/image";
import Link from "next/link";

export function LogoLink() {
  return (
    <Link
      href="https://www.openinary.dev/"
      target="_blank"
      rel="noopener noreferrer"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-40 hover:opacity-100 transition-opacity duration-300"
    >
      <Image
        src="/openinary.svg"
        alt="Openinary"
        width={80}
        height={80}
      />
    </Link>
  );
}






