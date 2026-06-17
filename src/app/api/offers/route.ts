import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/offers - list offers for an order
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const driverId = searchParams.get('driverId');

    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;
    if (driverId) where.driverId = driverId;

    const offers = await db.deliveryOffer.findMany({
      where,
      include: {
        driver: { select: { id: true, name: true, phone: true, points: true } },
        order: {
          select: {
            id: true,
            description: true,
            status: true,
            shop: { select: { name: true, address: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ offers });
  } catch (error) {
    console.error('Get offers error:', error);
    return NextResponse.json({ error: 'حصل خطأ' }, { status: 500 });
  }
}

// POST /api/offers - create offer (driver bids on order)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, driverId, price } = body;

    if (!orderId || !driverId || price === undefined) {
      return NextResponse.json({ error: 'كل البيانات مطلوبة' }, { status: 400 });
    }

    // Check if driver has enough points for 10% commission
    const driver = await db.user.findUnique({ where: { id: driverId } });
    if (!driver) {
      return NextResponse.json({ error: 'الدليفري مش موجود' }, { status: 404 });
    }

    const commissionPoints = Math.max(1, Math.ceil(driver.points * 0.10)); // minimum 1
    if (driver.points < commissionPoints) {
      return NextResponse.json({ error: `معندكش نقاط كافية. لازم يكون عندك على الأقل ${commissionPoints} نقطة (عمولة 10%). اشتري نقاط الأول` }, { status: 400 });
    }

    // Check if driver already offered on this order
    const existingOffer = await db.deliveryOffer.findFirst({
      where: { orderId, driverId },
    });
    if (existingOffer) {
      return NextResponse.json({ error: 'أنت عرضت على الطلب ده قبل كده' }, { status: 409 });
    }

    // Check if order is still available
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order || !['PENDING', 'OFFERED'].includes(order.status)) {
      return NextResponse.json({ error: 'الطلب ده مش متاح' }, { status: 400 });
    }

    // Create offer (no deduction here - 10% deducted when shop accepts)
    const offer = await db.deliveryOffer.create({
      data: { orderId, driverId, price, status: 'PENDING' },
      include: {
        driver: { select: { id: true, name: true, phone: true } },
      },
    });

    // Update order status to OFFERED if it was PENDING
    if (order.status === 'PENDING') {
      await db.order.update({
        where: { id: orderId },
        data: { status: 'OFFERED' },
      });
    }

    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    console.error('Create offer error:', error);
    return NextResponse.json({ error: 'حصل خطأ في تقديم العرض' }, { status: 500 });
  }
}
