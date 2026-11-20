import { cn } from "@/lib/cn";
import { ChartArt, ChatBubble, Coin, CoinStack, CoinTilt, Coupon, Friends, GiftBox, Glints, LottoBall, PhoneArt, Rays, RedEnvelope, TicketArt, Trophy } from "./pieces";

import { ART_KEYS, type ArtKey } from "./keys";

export { ART_KEYS, type ArtKey };


const float = "motion-safe:animate-float";

/** Banner compositions. Fills its (relative, sized) parent. */
export function BannerArt({ art, className, label }: { art: ArtKey; className?: string; label?: string }) {
  return (
    <div className={cn("pointer-events-none relative size-full", className)} aria-hidden="true">
      <Rays className="absolute top-1/2 left-1/2 size-[150%] -translate-x-1/2 -translate-y-1/2" />
      <Glints className="absolute inset-0 size-full" />
      {art === "gift" && (
        <>
          <GiftBox className="absolute top-[14%] left-[20%] w-[58%]" />
          <Coin className={cn("absolute top-[4%] left-[2%] w-[24%] -rotate-12", float)} />
          <CoinTilt className={cn("absolute top-[24%] right-[0%] w-[28%] rotate-[16deg] [animation-delay:-1.2s]", float)} />
          <Coin className={cn("absolute right-[10%] bottom-[2%] w-[20%] rotate-6 [animation-delay:-2.4s]", float)} />
        </>
      )}
      {art === "ticket" && (
        <>
          <TicketArt label={label} className="absolute top-[10%] left-[2%] w-[80%] -rotate-6" />
          <LottoBall n="9" tone="violet" className={cn("absolute right-[2%] bottom-[4%] w-[28%]", float)} />
          <LottoBall n="2" tone="gold" className={cn("absolute right-[26%] bottom-[0%] w-[23%] [animation-delay:-1s]", float)} />
          <LottoBall n="5" tone="red" className={cn("absolute top-[0%] right-[6%] w-[19%] [animation-delay:-2s]", float)} />
        </>
      )}
      {art === "envelope" && (
        <>
          <CoinStack className="absolute right-[2%] bottom-[2%] w-[34%]" count={5} />
          <RedEnvelope className="absolute top-[6%] left-[18%] w-[38%] -rotate-[10deg]" />
          <Coin className={cn("absolute top-[2%] right-[10%] w-[22%] rotate-12", float)} />
          <CoinTilt className={cn("absolute bottom-[8%] left-[2%] w-[26%] -rotate-12 [animation-delay:-1.6s]", float)} />
        </>
      )}
      {art === "balls" && (
        <>
          <LottoBall n="8" tone="violet" className={cn("absolute top-[8%] left-[8%] w-[34%]", float)} />
          <LottoBall n="1" tone="gold" className={cn("absolute top-[2%] right-[8%] w-[30%] [animation-delay:-0.8s]", float)} />
          <LottoBall n="6" tone="green" className={cn("absolute bottom-[2%] left-[30%] w-[32%] [animation-delay:-1.6s]", float)} />
          <LottoBall n="4" tone="blue" className={cn("absolute right-[0%] bottom-[14%] w-[24%] [animation-delay:-2.4s]", float)} />
          <LottoBall n="0" tone="red" className={cn("absolute bottom-[24%] left-[0%] w-[20%] [animation-delay:-3.2s]", float)} />
        </>
      )}
      {art === "phone-check" && (
        <>
          <CoinStack className="absolute right-[0%] bottom-[0%] w-[34%]" count={4} />
          <PhoneArt screen="check" className="absolute top-[0%] left-[26%] h-[100%] -rotate-[8deg]" />
          <Coin className={cn("absolute top-[8%] left-[4%] w-[22%] -rotate-12", float)} />
        </>
      )}
      {art === "phone-share" && (
        <>
          <Friends className="absolute right-[0%] bottom-[2%] w-[44%]" />
          <PhoneArt screen="share" className="absolute top-[0%] left-[14%] h-[100%] -rotate-[6deg]" />
          <Coin className={cn("absolute top-[6%] right-[8%] w-[20%] rotate-12", float)} />
        </>
      )}
      {art === "trophy" && (
        <>
          <CoinStack className="absolute bottom-[0%] left-[2%] w-[30%]" count={3} />
          <Trophy className="absolute top-[4%] left-[28%] h-[92%]" />
          <Coin className={cn("absolute top-[6%] right-[4%] w-[22%] rotate-12", float)} />
          <CoinTilt className={cn("absolute right-[6%] bottom-[8%] w-[24%] -rotate-6 [animation-delay:-1.4s]", float)} />
        </>
      )}
      {art === "coins" && (
        <>
          <CoinStack className="absolute bottom-[0%] left-[8%] w-[34%]" count={6} />
          <CoinStack className="absolute right-[6%] bottom-[0%] w-[30%]" count={4} />
          <Coin className={cn("absolute top-[4%] left-[36%] w-[26%]", float)} />
          <CoinTilt className={cn("absolute top-[18%] right-[0%] w-[24%] rotate-12 [animation-delay:-1.8s]", float)} />
        </>
      )}
    </div>
  );
}

export type MenuArtKey = "gift" | "envelope" | "friends" | "trophy" | "coupon" | "chat" | "ticket" | "chart" | "balls" | "coins";

/** Small square illustrations for quick-menu tiles and section headers. */
export function MenuArt({ art, className }: { art: MenuArtKey; className?: string }) {
  return (
    <span className={cn("relative inline-block", className)} aria-hidden="true">
      {art === "gift" && <GiftBox className="absolute inset-0 size-full" />}
      {art === "envelope" && <RedEnvelope className="absolute inset-[4%] size-[92%]" />}
      {art === "friends" && <Friends className="absolute inset-x-0 top-[12%] w-full" />}
      {art === "trophy" && <Trophy className="absolute inset-[2%] size-[96%]" />}
      {art === "coupon" && <Coupon className="absolute inset-x-0 top-[16%] w-full" />}
      {art === "chat" && <ChatBubble className="absolute inset-x-0 top-[6%] w-full" />}
      {art === "ticket" && <TicketArt className="absolute inset-x-0 top-[18%] w-full -rotate-6" />}
      {art === "chart" && <ChartArt className="absolute inset-x-0 top-[8%] w-full" />}
      {art === "coins" && <CoinStack className="absolute inset-x-[6%] bottom-[4%] w-[88%]" count={4} />}
      {art === "balls" && (
        <>
          <LottoBall n="8" tone="violet" className="absolute top-[4%] left-[2%] w-[60%]" />
          <LottoBall n="1" tone="gold" className="absolute right-[0%] bottom-[2%] w-[56%]" />
        </>
      )}
    </span>
  );
}
