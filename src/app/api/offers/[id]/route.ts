import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/offers/[id] - accept or reject offer
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body; // ACCEPTED or REJECTED

    if (!['ACCEPTED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'الحالة لازم تكون ACCEPTED أو REJECTED' }, { status: 400 });
    }

    const offer = await db.deliveryOffer.findUnique({
      where: { id },
      include: { order: true },
    });

    if (!offer) {
      return NextResponse.json({ error: 'العرض مش موجود' }, { status: 404 });
    }

    if (offer.status !== 'PENDING') {
      return NextResponse.json({ error: 'العرض ده اتعمل عليه إجراء قبل كده' }, { status: 400 });
    }

    if (status === 'ACCEPTED') {
      // Check driver points BEFORE accepting
      const driver = await db.user.findUnique({ where: { id: offer.driverId } });
      if (!driver) {
        return NextResponse.json({ error: 'الدليفري مش موجود' }, { status: 404 });
      }

      // Calculate 10% commission
      const commissionPoints = driver.points > 0 ? Math.max(1, Math.ceil(driver.points * 0.10)) : 0;

      // Update the offer
      const updatedOffer = await db.deliveryOffer.update({
        where: { id },
        data: { status: 'ACCEPTED' },
        include: {
          driver: { select: { id: true, name: true, phone: true, points: true } },
        },
      });

      // Update order: set accepted driver and status
      await db.order.update({
        where: { id: offer.orderId },
        data: { acceptedDriverId: offer.driverId, status: 'ACCEPTED' },
      });

      // Reject all other pending offers for this order
      await db.deliveryOffer.updateMany({
        where: {
          orderId: offer.orderId,
          status: 'PENDING',
          id: { not: id },
        },
        data: { status: 'REJECTED' },
      });

      // Deduct 10% of driver's points as commission
      if (commissionPoints > 0) {
        const actualDeduction = Math.min(commissionPoints, driver.points);
        await db.user.update({
          where: { id: offer.driverId },
          data: { points: { decrement: actualDeduction } },
        });

        await db.pointsTransaction.create({
          data: {
            userId: offer.driverId,
            amount: -actualDeduction,
            type: 'USAGE',
            description: `عمولة 10% على قبول توصيل طلب #${offer.orderId.slice(-6)} (${actualDeduction} نقطة من ${driver.points})`,
          },
        });
      }

      return NextResponse.json({
        offer: updatedOffer,
        commission: { driverPoints: driver.points, commissionPoints, deducted: commissionPoints > 0 },
      });
    }

    // REJECTED
    const updatedOffer = await db.deliveryOffer.update({
      where: { id },
      data: { status: 'REJECTED' },
      include: {
        driver: { select: { id: true, name: true, phone: true, points: true } },
      },
    });

    return NextResponse.json({ offer: updatedOffer });
  } catch (error) {
    console.error('Update offer error:', error);
    return NextResponse.json({ error: 'حصل خطأ' }, { status: 500 });
  }
}
