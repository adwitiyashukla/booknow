import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, BedDouble, Maximize, Star, Users } from 'lucide-react';

import { Badge, Card } from '@/components/ui';
import { formatMoney } from '@/lib/money';

export interface RoomCardData {
  slug: string;
  name: string;
  shortPitch: string;
  image: string | null;
  sizeSqm: number;
  bedType: string;
  bedCount: number;
  maxAdults: number;
  maxChildren: number;
  hasOceanView: boolean;
  hasBalcony: boolean;
  isAccessible: boolean;
  rating: number;
  reviewCount: number;
  nightlyCents: number;
  totalCents?: number;
  nights?: number;
  unitsAvailable: number;
  matchReasons?: string[];
}

export function RoomCard({ room, query }: { room: RoomCardData; query?: string }) {
  const href = `/rooms/${room.slug}${query ? `?${query}` : ''}`;
  const scarce = room.unitsAvailable > 0 && room.unitsAvailable <= 2;

  return (
    <Card className="group flex flex-col transition-transform duration-300 hover:-translate-y-1">
      <div className="relative aspect-[16/10] overflow-hidden bg-ink-800">
        {room.image ? (
          <Image
            src={room.image}
            alt={room.name}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : null}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {room.hasOceanView ? <Badge tone="brand">Ocean view</Badge> : null}
          {room.isAccessible ? <Badge tone="neutral">Step free</Badge> : null}
        </div>
        {scarce ? (
          <div className="absolute right-3 top-3">
            <Badge tone="warn">
              {room.unitsAvailable} left
            </Badge>
          </div>
        ) : null}
        {room.unitsAvailable === 0 ? (
          <div className="absolute right-3 top-3">
            <Badge tone="bad">Sold out</Badge>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-[family-name:var(--font-display)] text-xl text-ink-50">{room.name}</h3>
            {/* A score with nothing behind it is worse than no score at all. */}
            {room.reviewCount > 0 ? (
              <span className="flex shrink-0 items-center gap-1 text-sm text-ink-300">
                <Star className="size-3.5 fill-sand-500 text-sand-500" />
                {room.rating.toFixed(1)}
                <span className="text-ink-500">({room.reviewCount})</span>
              </span>
            ) : (
              <span className="shrink-0 text-xs uppercase tracking-wider text-ink-500">
                Not yet rated
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-ink-300">{room.shortPitch}</p>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-500">
          <li className="flex items-center gap-1.5"><Maximize className="size-3.5" />{room.sizeSqm} sqm</li>
          <li className="flex items-center gap-1.5">
            <BedDouble className="size-3.5" />
            {room.bedCount} {room.bedType.toLowerCase()} bed{room.bedCount > 1 ? 's' : ''}
          </li>
          <li className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            Sleeps {room.maxAdults + room.maxChildren}
          </li>
        </ul>

        {room.matchReasons?.length ? (
          <ul className="space-y-1 rounded-xl bg-brand-500/8 p-3 text-xs text-brand-200">
            {room.matchReasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 border-t hairline pt-4">
          <div>
            <p className="text-xs text-ink-500">
              {room.nights ? `${room.nights} night${room.nights > 1 ? 's' : ''} from` : 'From'}
            </p>
            <p className="text-xl font-semibold text-ink-50">
              {formatMoney(room.nightlyCents)}
              <span className="text-sm font-normal text-ink-500"> / night</span>
            </p>
            {room.totalCents ? (
              <p className="text-xs text-ink-500">{formatMoney(room.totalCents)} total incl. tax</p>
            ) : null}
          </div>
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-full bg-ink-800/80 px-4 py-2 text-sm text-ink-100 transition-colors hover:bg-brand-500 hover:text-ink-950"
          >
            View <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
