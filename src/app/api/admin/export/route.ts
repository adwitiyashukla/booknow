import { requireRole } from '@/server/auth';
import { db } from '@/server/db';
import { toErrorResponse } from '@/server/errors';

export async function GET() {
  try {
    await requireRole('ADMIN', 'STAFF');

    const bookings = await db.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { roomType: { select: { name: true } }, roomUnit: { select: { code: true } } },
    });

    const header = [
      'reference', 'status', 'guest', 'email', 'room_type', 'unit',
      'check_in', 'check_out', 'nights', 'adults', 'children',
      'subtotal', 'taxes', 'fees', 'total', 'currency', 'created_at',
    ];

    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = bookings.map((b) =>
      [
        b.reference, b.status, b.guestName, b.guestEmail, b.roomType.name, b.roomUnit?.code ?? '',
        b.checkIn.toISOString().slice(0, 10), b.checkOut.toISOString().slice(0, 10),
        b.nights, b.adults, b.children,
        (b.subtotalCents / 100).toFixed(2), (b.taxesCents / 100).toFixed(2),
        (b.feesCents / 100).toFixed(2), (b.totalCents / 100).toFixed(2),
        b.currency, b.createdAt.toISOString(),
      ].map(escape).join(','),
    );

    return new Response([header.join(','), ...rows].join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="booknow-bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return Response.json(body, { status });
  }
}
