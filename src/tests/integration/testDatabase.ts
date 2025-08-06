import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

// Create a separate Prisma client for testing
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/portfolio_tracker_test'
    }
  }
});

export class TestDatabaseManager {
  private static instance: TestDatabaseManager;
  private isSetup = false;

  static getInstance(): TestDatabaseManager {
    if (!TestDatabaseManager.instance) {
      TestDatabaseManager.instance = new TestDatabaseManager();
    }
    return TestDatabaseManager.instance;
  }

  async setupTestDatabase(): Promise<void> {
    if (this.isSetup) return;

    try {
      // Run database migrations for test database
      execSync('npx prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        stdio: 'inherit'
      });

      // Connect to test database
      await testPrisma.$connect();
      this.isSetup = true;
    } catch (error) {
      console.error('Failed to setup test database:', error);
      throw error;
    }
  }

  async cleanupTestDatabase(): Promise<void> {
    if (!this.isSetup) return;

    try {
      // Clean up all tables in reverse dependency order
      await testPrisma.dailyReport.deleteMany();
      await testPrisma.marketData.deleteMany();
      await testPrisma.stockPosition.deleteMany();
      await testPrisma.notificationSettings.deleteMany();
      await testPrisma.user.deleteMany();
    } catch (error) {
      console.error('Failed to cleanup test database:', error);
      throw error;
    }
  }

  async teardownTestDatabase(): Promise<void> {
    if (!this.isSetup) return;

    try {
      await this.cleanupTestDatabase();
      await testPrisma.$disconnect();
      this.isSetup = false;
    } catch (error) {
      console.error('Failed to teardown test database:', error);
      throw error;
    }
  }

  async createTestUser(userData?: Partial<any>): Promise<any> {
    const defaultUser = {
      id: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      email: `test-${Date.now()}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      passwordHash: '$2b$10$test.hash.for.testing.purposes.only',
      ...userData
    };

    return await testPrisma.user.create({
      data: {
        ...defaultUser,
        notificationSettings: {
          create: {
            emailEnabled: true,
            dailyUpdateEnabled: true,
            updateTime: '09:00',
            alertThreshold: 5.0,
            weekendsEnabled: false
          }
        }
      },
      include: {
        notificationSettings: true,
        stockPositions: true
      }
    });
  }

  async createTestStockPosition(userId: string, positionData?: Partial<any>): Promise<any> {
    const defaultPosition = {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      quantity: 10,
      purchasePrice: 150.00,
      purchaseDate: new Date('2024-01-01'),
      currentPrice: 155.00,
      sector: 'Technology',
      marketCap: 'Large Cap',
      ...positionData
    };

    return await testPrisma.stockPosition.create({
      data: {
        userId,
        ...defaultPosition
      }
    });
  }

  async createTestMarketData(marketData?: Partial<any>): Promise<any> {
    const defaultMarketData = {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      currentPrice: 155.00,
      previousClose: 150.00,
      changePercent: 3.33,
      volume: BigInt(50000000),
      marketCap: 'Large Cap',
      sector: 'Technology',
      ...marketData
    };

    return await testPrisma.marketData.create({
      data: defaultMarketData
    });
  }

  async beginTransaction(): Promise<any> {
    return await testPrisma.$transaction(async (tx) => {
      return tx;
    });
  }

  getPrismaClient(): PrismaClient {
    return testPrisma;
  }
}

// Global test database manager instance
export const testDb = TestDatabaseManager.getInstance();