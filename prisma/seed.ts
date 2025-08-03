import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create sample users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const user1 = await prisma.user.upsert({
    where: { email: 'john.doe@example.com' },
    update: {},
    create: {
      email: 'john.doe@example.com',
      passwordHash: hashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      notificationSettings: {
        create: {
          emailEnabled: true,
          dailyUpdateEnabled: true,
          updateTime: '09:00',
          alertThreshold: 5.0,
          weekendsEnabled: false,
        },
      },
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'jane.smith@example.com' },
    update: {},
    create: {
      email: 'jane.smith@example.com',
      passwordHash: hashedPassword,
      firstName: 'Jane',
      lastName: 'Smith',
      notificationSettings: {
        create: {
          emailEnabled: true,
          dailyUpdateEnabled: true,
          updateTime: '08:30',
          alertThreshold: 3.0,
          weekendsEnabled: true,
        },
      },
    },
  });

  console.log('👤 Created users:', { user1: user1.email, user2: user2.email });

  // Create sample stock positions for user1
  const stockPositions1 = await Promise.all([
    prisma.stockPosition.upsert({
      where: { id: 'sample-position-1' },
      update: {},
      create: {
        id: 'sample-position-1',
        userId: user1.id,
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        quantity: 50,
        purchasePrice: 150.25,
        purchaseDate: new Date('2024-01-15'),
        currentPrice: 175.50,
        sector: 'Technology',
        marketCap: 'Large Cap',
      },
    }),
    prisma.stockPosition.upsert({
      where: { id: 'sample-position-2' },
      update: {},
      create: {
        id: 'sample-position-2',
        userId: user1.id,
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc.',
        quantity: 25,
        purchasePrice: 120.75,
        purchaseDate: new Date('2024-02-01'),
        currentPrice: 135.20,
        sector: 'Technology',
        marketCap: 'Large Cap',
      },
    }),
    prisma.stockPosition.upsert({
      where: { id: 'sample-position-3' },
      update: {},
      create: {
        id: 'sample-position-3',
        userId: user1.id,
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        quantity: 30,
        purchasePrice: 280.00,
        purchaseDate: new Date('2024-01-20'),
        currentPrice: 295.75,
        sector: 'Technology',
        marketCap: 'Large Cap',
      },
    }),
  ]);

  // Create sample stock positions for user2
  const stockPositions2 = await Promise.all([
    prisma.stockPosition.upsert({
      where: { id: 'sample-position-4' },
      update: {},
      create: {
        id: 'sample-position-4',
        userId: user2.id,
        symbol: 'TSLA',
        companyName: 'Tesla, Inc.',
        quantity: 15,
        purchasePrice: 200.50,
        purchaseDate: new Date('2024-01-10'),
        currentPrice: 185.25,
        sector: 'Consumer Discretionary',
        marketCap: 'Large Cap',
      },
    }),
    prisma.stockPosition.upsert({
      where: { id: 'sample-position-5' },
      update: {},
      create: {
        id: 'sample-position-5',
        userId: user2.id,
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        quantity: 20,
        purchasePrice: 450.00,
        purchaseDate: new Date('2024-02-15'),
        currentPrice: 520.75,
        sector: 'Technology',
        marketCap: 'Large Cap',
      },
    }),
  ]);

  console.log('📈 Created stock positions:', {
    user1Positions: stockPositions1.length,
    user2Positions: stockPositions2.length,
  });

  // Create sample market data
  const marketData = await Promise.all([
    prisma.marketData.upsert({
      where: { symbol: 'AAPL' },
      update: {
        currentPrice: 175.50,
        previousClose: 173.25,
        changePercent: 1.30,
        volume: BigInt(45000000),
        lastUpdated: new Date(),
      },
      create: {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        currentPrice: 175.50,
        previousClose: 173.25,
        changePercent: 1.30,
        volume: BigInt(45000000),
        marketCap: 'Large Cap',
        sector: 'Technology',
      },
    }),
    prisma.marketData.upsert({
      where: { symbol: 'GOOGL' },
      update: {
        currentPrice: 135.20,
        previousClose: 133.80,
        changePercent: 1.05,
        volume: BigInt(28000000),
        lastUpdated: new Date(),
      },
      create: {
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc.',
        currentPrice: 135.20,
        previousClose: 133.80,
        changePercent: 1.05,
        volume: BigInt(28000000),
        marketCap: 'Large Cap',
        sector: 'Technology',
      },
    }),
    prisma.marketData.upsert({
      where: { symbol: 'MSFT' },
      update: {
        currentPrice: 295.75,
        previousClose: 292.10,
        changePercent: 1.25,
        volume: BigInt(32000000),
        lastUpdated: new Date(),
      },
      create: {
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        currentPrice: 295.75,
        previousClose: 292.10,
        changePercent: 1.25,
        volume: BigInt(32000000),
        marketCap: 'Large Cap',
        sector: 'Technology',
      },
    }),
    prisma.marketData.upsert({
      where: { symbol: 'TSLA' },
      update: {
        currentPrice: 185.25,
        previousClose: 188.50,
        changePercent: -1.72,
        volume: BigInt(55000000),
        lastUpdated: new Date(),
      },
      create: {
        symbol: 'TSLA',
        companyName: 'Tesla, Inc.',
        currentPrice: 185.25,
        previousClose: 188.50,
        changePercent: -1.72,
        volume: BigInt(55000000),
        marketCap: 'Large Cap',
        sector: 'Consumer Discretionary',
      },
    }),
    prisma.marketData.upsert({
      where: { symbol: 'NVDA' },
      update: {
        currentPrice: 520.75,
        previousClose: 510.25,
        changePercent: 2.06,
        volume: BigInt(38000000),
        lastUpdated: new Date(),
      },
      create: {
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        currentPrice: 520.75,
        previousClose: 510.25,
        changePercent: 2.06,
        volume: BigInt(38000000),
        marketCap: 'Large Cap',
        sector: 'Technology',
      },
    }),
  ]);

  console.log('📊 Created market data entries:', marketData.length);

  // Create a sample daily report
  const sampleReport = await prisma.dailyReport.upsert({
    where: {
      userId_reportDate: {
        userId: user1.id,
        reportDate: new Date('2024-02-01'),
      },
    },
    update: {},
    create: {
      userId: user1.id,
      reportDate: new Date('2024-02-01'),
      portfolioValue: 25875.00,
      dailyChange: 325.50,
      dailyChangePercent: 1.27,
      significantMovers: [
        {
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          changePercent: 2.1,
          currentPrice: 175.50,
        },
      ],
      sectorPerformance: [
        {
          sector: 'Technology',
          totalValue: 25875.00,
          changePercent: 1.27,
          positions: 3,
        },
      ],
      marketSummary: 'Technology stocks showed strong performance today with major gains across the sector.',
      emailSent: true,
      emailSentAt: new Date('2024-02-01T09:00:00Z'),
    },
  });

  console.log('📧 Created sample daily report for:', user1.email);

  console.log('✅ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });