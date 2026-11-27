import type { ReactNode } from "react";
import { PORTRAITS, type Avatar } from "@/domain/avatar";
import face1 from "./avatars/face-1.webp";
import face2 from "./avatars/face-2.webp";
import face3 from "./avatars/face-3.webp";
import face4 from "./avatars/face-4.webp";
import face5 from "./avatars/face-5.webp";
import face6 from "./avatars/face-6.webp";
import face7 from "./avatars/face-7.webp";
import face8 from "./avatars/face-8.webp";
import face9 from "./avatars/face-9.webp";
import face10 from "./avatars/face-10.webp";
import face11 from "./avatars/face-11.webp";

/*
 * The office portraits of the avatar picker. Eleven are WebP files, imported so the build puts them
 * under /_next/static (the standalone deploy copies that folder, not `public/`). The rest are plain
 * SVG on a 64×64 grid. Fixed colours: they are pictures, not themed UI.
 */

const FACES = {
  "face-1": face1,
  "face-2": face2,
  "face-3": face3,
  "face-4": face4,
  "face-5": face5,
  "face-6": face6,
  "face-7": face7,
  "face-8": face8,
  "face-9": face9,
  "face-10": face10,
  "face-11": face11,
} as const;

type Face = keyof typeof FACES;
type Drawn = Exclude<Avatar, Face>;

type Hair = "sidePart" | "crop" | "quiff" | "curly" | "buzz" | "long" | "bob" | "bun" | "ponytail" | "wavy" | "spiky" | "bald" | "hijab" | "pixie";
type Outfit = "suit" | "shirt" | "blazer" | "sweater" | "hoodie";

interface Look {
  background: string;
  skin: string;
  hair: Hair;
  hairColor: string;
  outfit: Outfit;
  cloth: string;
  /** tie, collar shadow or necklace */
  accent: string;
  glasses?: boolean;
  headset?: boolean;
  badge?: boolean;
  beard?: boolean;
  earrings?: boolean;
  moustache?: boolean;
}

const LOOKS: Record<Drawn, Look> = {
  "staff-1": { background: "#dbe7ff", skin: "#f1c7a3", hair: "sidePart", hairColor: "#2b2220", outfit: "suit", cloth: "#2f3b66", accent: "#c0392b" },
  "staff-2": { background: "#ffe2ec", skin: "#f6d0b1", hair: "long", hairColor: "#3a2a24", outfit: "blazer", cloth: "#7b3f61", accent: "#f2c35e", earrings: true },
  "staff-3": { background: "#dff3e4", skin: "#d9a577", hair: "crop", hairColor: "#1f1a18", outfit: "shirt", cloth: "#4a90d9", accent: "#2f6aa8", glasses: true, badge: true },
  "staff-4": { background: "#fff0d4", skin: "#e8b48c", hair: "bun", hairColor: "#1f1a18", outfit: "shirt", cloth: "#ffffff", accent: "#c9d2e3", glasses: true, badge: true },
  "staff-5": { background: "#ede3ff", skin: "#f3cba8", hair: "quiff", hairColor: "#6b4428", outfit: "sweater", cloth: "#2e7d6b", accent: "#ffffff", beard: true },
  "staff-6": { background: "#d8f1f5", skin: "#c98f65", hair: "bob", hairColor: "#241c1a", outfit: "sweater", cloth: "#e0794b", accent: "#ffffff", headset: true },
  "staff-7": { background: "#ffe6d9", skin: "#a8704a", hair: "curly", hairColor: "#191412", outfit: "blazer", cloth: "#3d4450", accent: "#8fb8ff" },
  "staff-8": { background: "#e6f0cf", skin: "#f6d3b8", hair: "ponytail", hairColor: "#8a4f2a", outfit: "suit", cloth: "#31505c", accent: "#31505c", badge: true },
  "staff-9": { background: "#e2e5ee", skin: "#eabd98", hair: "buzz", hairColor: "#55504d", outfit: "suit", cloth: "#4b4f5c", accent: "#2f5fb3", glasses: true },
  "staff-10": { background: "#fde3f6", skin: "#e0a97f", hair: "wavy", hairColor: "#4a2e22", outfit: "shirt", cloth: "#b8484f", accent: "#8f3138", glasses: true, earrings: true },
  "staff-11": { background: "#d9ecff", skin: "#f2c9a8", hair: "spiky", hairColor: "#33241d", outfit: "hoodie", cloth: "#e39b2d", accent: "#fff4dc" },
  "staff-12": { background: "#fbe9e7", skin: "#e6b08a", hair: "hijab", hairColor: "#2f7f86", outfit: "blazer", cloth: "#2b4257", accent: "#f2c35e", badge: true },
  "staff-13": { background: "#e8f0e0", skin: "#b97f56", hair: "bald", hairColor: "#2a211d", outfit: "shirt", cloth: "#dbe6f7", accent: "#7f96c2", glasses: true, moustache: true },
  "staff-14": { background: "#f1e6ff", skin: "#f5d2ba", hair: "pixie", hairColor: "#b5622f", outfit: "blazer", cloth: "#176b64", accent: "#ffd27a", earrings: true },
};

/** Hair behind the head. */
const BACK: Partial<Record<Hair, string>> = {
  long: "M17 30C15 12 24 9.5 32 9.5S49 12 47 30L49.5 50C45 53 40 51 39 46H25C24 51 19 53 14.5 50Z",
  bob: "M17.5 38C15 13 23 10 32 10S49 13 46.5 38C44 41.5 41 41 39.5 38.5H24.5C23 41 20 41.5 17.5 38Z",
  ponytail: "M41 15C54 15 56 33 49 45C49 37 46 32 42 30Z",
  wavy: "M18 28C15 12 24 10 32 10S49 12 46 28C50 33 45 37 48.5 42C46 48 41 47 39 43H25C23 47 18 48 15.5 42C19 37 14 33 18 28Z",
};

/** Hair over the forehead. */
const FRONT: Record<Hair, string> = {
  sidePart: "M20 28C18.500 15 26 12 33 12.500C41 13 45.500 18 44 28C42.500 22 41 20.500 39 19C34 23 26 23.500 22.500 22.500C21.500 24 20.500 25.500 20 28Z",
  crop: "M20 27C19 15 26 13 32 13S45 15 44 27C42 20 38 18.500 32 18.500S22 20 20 27Z",
  quiff: "M20 28C18 17 22 13.500 27 13.500C29 8.500 41 8 42.500 14.500C46 17 45 23 44 28C42.500 22 40 20.500 37 20C31 18.500 24 20 20 28Z",
  curly:
    "M19.500 27C16 24 17 19 20.500 18.500C19.500 13.500 25 11 28 13C30 9 36 9 38 12.500C42 11 46 15 43.500 18.500C47 20 47 25 44 27C43 22 40 20 32 20S21 22 19.500 27Z",
  buzz: "M20.500 25C20.500 16 26 14.500 32 14.500S43.500 16 43.500 25C41 20.500 37 19.500 32 19.500S23 20.500 20.500 25Z",
  long: "M19.500 29C18.500 15 26 12.500 32 12.500C40 12.500 45.500 16 44.500 29C40 25 37 20 36 16.500C32 22.500 25 25 19.500 29Z",
  bob: "M19.500 27C19.500 15 26 12.500 32 12.500S44.500 15 44.500 27C42 22 39 20.500 32 21.500C26 22 22.500 23 19.500 27Z",
  bun: "M20 28C19 16 26 13.500 32 13.500S45 16 44 28C42 22 38 19 34 18C30 22 24 22.500 21.500 23Z",
  ponytail: "M20 28C19 15 26 12.500 32 12.500C40 12.500 45 16 44 28C41 23 38 20.500 35 17C31 22 25 23 21.500 24Z",
  spiky: "M20 27L19 18L23 19L23.500 12L28 15.500L31.500 9L35 15L40.500 11.500L40.500 17.500L45.500 17L44 27C42 21 38 19 32 19S22 21 20 27Z",
  bald: "M20.300 28C19.800 23 21 20.500 23 19C22.300 22 22.400 25 22 28ZM43.700 28C44.200 23 43 20.500 41 19C41.700 22 41.600 25 42 28Z",
  // A scarf with an opening for the face (drawn with the even-odd rule).
  hijab: "M32 9C20 9 16 18 16.500 29C17 38 19 44 14.500 51C22 56 42 56 49.500 51C45 44 47 39 47.500 29C48 18 44 9 32 9ZM32 17C25.500 17 22 22 22 29C22 36 27 41.500 32 41.500S42 36 42 29C42 22 38.500 17 32 17Z",
  pixie: "M19.500 32C17 16 25 11.500 33 12C42 12.500 47 19 44.500 30C42.500 24 41 22 39 20C35 24 27 22.500 24 20C22 23 21.500 27 19.500 32Z",
  wavy: "M19.500 29C18 15 26 12.500 32 12.500C40 12.500 46 16 44.500 29C42 24 40 22 37 20.500C36 23 31 21 29 19C27 23 22 23 19.500 29Z",
};

function Clothes({ look }: { look: Look }) {
  const body = <path d="M10 64C10 50 20 44 32 44S54 50 54 64Z" fill={look.cloth} />;
  if (look.outfit === "sweater") {
    return (
      <>
        {body}
        <path d="M26 44.500C27 49 37 49 38 44.500" fill="none" stroke={look.accent} strokeWidth="2" strokeLinecap="round" />
      </>
    );
  }
  if (look.outfit === "hoodie") {
    return (
      <>
        {body}
        <path d="M24 44C24 52 40 52 40 44L44 47C41 56 23 56 20 47Z" fill="#000000" opacity="0.16" />
        <path d="M28.500 51V59M35.500 51V59" stroke={look.accent} strokeWidth="1.400" strokeLinecap="round" />
      </>
    );
  }
  if (look.outfit === "shirt") {
    return (
      <>
        {body}
        <path d="M26.500 43.500L32 49.500L27 52.500L23.500 46ZM37.500 43.500L32 49.500L37 52.500L40.500 46Z" fill={look.cloth} stroke={look.accent} strokeWidth="1" strokeLinejoin="round" />
        <path d="M32 50V64" stroke={look.accent} strokeWidth="1" />
      </>
    );
  }
  return (
    <>
      {body}
      <path d="M25 44.500L32 60L39 44.500C35 43 29 43 25 44.500Z" fill="#ffffff" />
      {look.outfit === "suit" ? (
        <path d="M30.300 46H33.700L33 49L35 58L32 61.500L29 58L31 49Z" fill={look.accent} />
      ) : (
        <circle cx="32" cy="50" r="1.600" fill={look.accent} />
      )}
      <path d="M25 44.500L32 60L23 52ZM39 44.500L32 60L41 52Z" fill="#000000" opacity="0.18" />
    </>
  );
}

const isFace = (id: Avatar): id is Face => id in FACES;

/** One portrait: a picture file, or the drawing. Decorative: whatever holds it carries the label. */
export function StaffAvatar({ id, className = "size-full" }: { id: Avatar; className?: string }) {
  if (isFace(id)) {
    const file = FACES[id];
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof file === "string" ? file : file.src} alt="" className={`border border-line object-cover ${className}`} />;
  }
  return <Drawing id={id} className={className} />;
}

function Drawing({ id, className }: { id: Drawn; className: string }) {
  const look = LOOKS[id];
  const woman = PORTRAITS.some((p) => p.id === id && p.gender === "female");
  const coversEars = look.hair === "long" || look.hair === "bob" || look.hair === "wavy" || look.hair === "hijab";
  const layer = (show: boolean | undefined, children: ReactNode) => (show ? children : null);
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" fill={look.background} />
      {layer(look.hair === "bun", <circle cx="32" cy="11.500" r="6.500" fill={look.hairColor} />)}
      {BACK[look.hair] && <path d={BACK[look.hair]} fill={look.hairColor} />}
      <Clothes look={look} />
      <path d="M28 36H36V45C34 48 30 48 28 45Z" fill={look.skin} />
      <path d="M28 38C30 42 34 42 36 38V36H28Z" fill="#000000" opacity="0.1" />
      {layer(
        !coversEars,
        <>
          <circle cx="20.300" cy="29.500" r="2.500" fill={look.skin} />
          <circle cx="43.700" cy="29.500" r="2.500" fill={look.skin} />
        </>,
      )}
      <ellipse cx="32" cy="28" rx="12" ry="13.500" fill={look.skin} />
      {layer(look.beard, <path d="M21.500 31C22 40 27 42 32 42S42 40 42.500 31C40 34.500 37 33 32 33S24 34.500 21.500 31Z" fill={look.hairColor} opacity="0.85" />)}
      <path d="M25 25.500Q27.500 24 30 25.200M34 25.200Q36.500 24 39 25.500" fill="none" stroke={look.hairColor} strokeWidth="1.100" strokeLinecap="round" />
      <circle cx="27.500" cy="29" r="1.400" fill="#26201e" />
      <circle cx="36.500" cy="29" r="1.400" fill="#26201e" />
      {layer(woman, <path d="M25.400 28.200L24.200 27.200M38.600 28.200L39.800 27.200" stroke="#26201e" strokeWidth="0.900" strokeLinecap="round" />)}
      {layer(
        woman,
        <>
          <circle cx="24.500" cy="33" r="2" fill="#e8737a" opacity="0.35" />
          <circle cx="39.500" cy="33" r="2" fill="#e8737a" opacity="0.35" />
        </>,
      )}
      <path d="M32 29.500Q30.800 32.800 32.600 33" fill="none" stroke="#000000" strokeOpacity="0.18" strokeWidth="1" strokeLinecap="round" />
      <path d="M28.500 35.500Q32 38.600 35.500 35.500" fill="none" stroke={woman ? "#b8434f" : look.beard ? "#ffffff" : "#7a3d33"} strokeWidth="1.500" strokeLinecap="round" />
      {layer(look.moustache, <path d="M27.500 34.500Q29.800 32.300 32 34Q34.200 32.300 36.500 34.500Q34 35.600 32 34.800Q30 35.600 27.500 34.500Z" fill={look.hairColor} />)}
      <path d={FRONT[look.hair]} fill={look.hairColor} fillRule="evenodd" />
      {layer(
        look.glasses,
        <g fill="none" stroke="#2b2f3a" strokeWidth="1.100">
          <rect x="23.200" y="26" width="8" height="6.200" rx="2.400" />
          <rect x="32.800" y="26" width="8" height="6.200" rx="2.400" />
          <path d="M31.200 28.200H32.800M23.200 28L20.500 27.500M40.800 28L43.500 27.500" />
        </g>,
      )}
      {layer(
        look.earrings,
        <>
          <circle cx="20.800" cy="34.500" r="1.300" fill="#f2c35e" />
          <circle cx="43.200" cy="34.500" r="1.300" fill="#f2c35e" />
        </>,
      )}
      {layer(
        look.headset,
        <g stroke="#2b2f3a" strokeLinecap="round">
          <path d="M18.500 29C17 7 47 7 45.500 29" fill="none" strokeWidth="2" />
          <path d="M18.500 27V33M45.500 27V33" strokeWidth="4.500" />
          <path d="M45.500 33C45 38 40 39 36.500 38.500" fill="none" strokeWidth="1.300" />
          <circle cx="36" cy="38.500" r="1.500" fill="#2b2f3a" stroke="none" />
        </g>,
      )}
      {layer(
        look.badge,
        <>
          <path d="M25.500 45L42 57M38.500 45L43.500 54" fill="none" stroke="#4e3dbc" strokeWidth="1.200" />
          <rect x="39.500" y="54" width="9" height="10" rx="1.200" fill="#ffffff" stroke="#4e3dbc" strokeWidth="0.800" />
          <circle cx="44" cy="57.500" r="1.700" fill="#4e3dbc" />
          <path d="M41.500 61.500H46.500" stroke="#4e3dbc" strokeWidth="1" />
        </>,
      )}
    </svg>
  );
}
