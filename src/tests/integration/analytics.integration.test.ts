import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import analyticsRoutes from '../../routes/analytics';
import { testDb, testPrisma } from './testDatabase';
import { marketDataService } from '../../services/marketDataService';

// Mock market data service
jest.mock('../../services/marketDataService');
const mockMarketDataService = marketDataService as jest.Mocked<typeof marketDataService>;

// Create test app
const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);

describe('Analytics Integration Tests', () => {
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    await testDb.setupTestDatabase();
  });

  afterAll(async () => {
    await testDb.teardownTestDatabase();
  });

  beforeEach(async () => {
    await testDb.cleanupTestDatabase();
    
    // Create test user
    testUser = await testDb.createTestUser({
      email: 'analytics-test@example.com'
    });

    // Generate auth token
    authToken = jwt.sign(
      { userId: testUser.id },
      process.env.JWT_SECRET || 'test-jwt-secret',
      { expiresIn: '24h' }
    );

    // Reset mocks
    jest.clearAllMocks();

    // Setup market data mocks
    mockMarketDataService.getBatchPrices.mockResolvedValue([
      { symbol: 'AAPL', price: 155.00, change: 5.00, changePercent: 3.33, lastUpdated: new Date() },
      { symbol: 'GOOGL', price: 2850.00, change: 50.00, changePercent: 1.79, lastUpdated: new Date() },
      { symbol: 'MSFT', price: 310.00, change: 5.00, changePercent: 1.64, lastUpdated: new Date() },
      { symbol: 'TSLA', price: 220.00, change: 5.00, changePercent: 2.33, lastUpdated: new Date() }
    ]);

    mockMarketDataService.getHistoricalData.mockResolvedValue([
      { date: new Date('2024-01-01'), open: 149.00, high: 151.00, low: 148.00, close: 150.00, volume: 50000000 },
      { date: new Date('2024-01-02'), open: 150.00, high: 153.00, low: 149.00, close: 152.00, volume: 45000000 },
      { date: new Date('2024-01-03'), open: 152.00, high: 156.00, low: 151.00, close: 155.00, volume: 48000000 }
    ]);
  });

  describe('GET /api/analytics/sectors', () => {
    beforeEach(async () => {
      // Create diversified portfolio
      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        quantity: 10,
        purchasePrice: 145.50,
        currentPrice: 155.00,
        sector: 'Technology',
        marketCap: 'Large Cap'
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc.',
        quantity: 5,
        purchasePrice: 2800.00,
        currentPrice: 2850.00,
        sector: 'Technology',
        marketCap: 'Large Cap'
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'JNJ',
        companyName: 'Johnson & Johnson',
        quantity: 15,
        purchasePrice: 160.00,
        currentPrice: 165.00,
        sector: 'Healthcare',
        marketCap: 'Large Cap'
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'JPM',
        companyName: 'JPMorgan Chase',
        quantity: 8,
        purchasePrice: 140.00,
        currentPrice: 145.00,
        sector: 'Financial Services',
        marketCap: 'Large Cap'
      });
    });

    it('should return sector allocation analysis from database', async () => {
      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sectorAllocation).toBeDefined();
      expect(Array.isArray(response.body.data.sectorAllocation)).toBe(true);

      const sectors = response.body.data.sectorAllocation;
      
      // Should have 3 sectors
      expect(sectors).toHaveLength(3);

      // Verify sector data structure
      sectors.forEach((sector: any) => {
        expect(sector.sector).toBeDefined();
        expect(sector.value).toBeGreaterThan(0);
        expect(sector.percentage).toBeGreaterThan(0);
        expect(sector.positions).toBeGreaterThan(0);
      });

      // Verify percentages sum to 100
      const totalPercentage = sectors.reduce((sum: number, sector: any) => sum + sector.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);

      // Verify Technology sector has highest allocation (2 positions)
      const techSector = sectors.find((s: any) => s.sector === 'Technology');
      expect(techSector).toBeTruthy();
      expect(techSector.positions).toBe(2);
    });

    it('should return empty allocation for user with no positions', async () => {
      // Clean up positions
      await testPrisma.stockPosition.deleteMany({
        where: { userId: testUser.id }
      });

      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sectorAllocation).toHaveLength(0);
    });

    it('should only analyze authenticated user positions', async () => {
      // Create another user with different positions
      const otherUser = await testDb.createTestUser({
        email: 'other-analytics@example.com'
      });
      await testDb.createTestStockPosition(otherUser.id, {
        symbol: 'TSLA',
        sector: 'Automotive',
        quantity: 20
      });

      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Should not include Automotive sector from other user
      const sectors = response.body.data.sectorAllocation;
      const automotiveSector = sectors.find((s: any) => s.sector === 'Automotive');
      expect(automotiveSector).toBeFalsy();
    });

    it('should handle positions with null sectors', async () => {
      // Add position with null sector
      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'UNKNOWN',
        sector: null,
        quantity: 5
      });

      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Should handle null sectors gracefully
      const sectors = response.body.data.sectorAllocation;
      const unknownSector = sectors.find((s: any) => s.sector === 'Unknown' || s.sector === null);
      expect(unknownSector).toBeTruthy();
    });
  });

  describe('GET /api/analytics/performance', () => {
    beforeEach(async () => {
      // Create test positions with different performance
      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        currentPrice: 155.00 // +6.53% gain
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'GOOGL',
        quantity: 5,
        purchasePrice: 2800.00,
        currentPrice: 2750.00 // -1.79% loss
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'MSFT',
        quantity: 8,
        purchasePrice: 300.00,
        currentPrice: 320.00 // +6.67% gain
      });
    });

    it('should return performance metrics from database', async () => {
      const response = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.portfolioMetrics).toBeDefined();

      const metrics = response.body.data.portfolioMetrics;
      
      // Verify required metrics
      expect(metrics.totalValue).toBeGreaterThan(0);
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.totalReturn).toBeDefined();
      expect(metrics.totalReturnPercent).toBeDefined();
      expect(metrics.topPerformers).toBeDefined();
      expect(metrics.topLosers).toBeDefined();

      // Verify top performers and losers
      expect(Array.isArray(metrics.topPerformers)).toBe(true);
      expect(Array.isArray(metrics.topLosers)).toBe(true);

      // MSFT should be top performer (+6.67%)
      const topPerformer = metrics.topPerformers[0];
      expect(topPerformer?.symbol).toBe('MSFT');

      // GOOGL should be top loser (-1.79%)
      const topLoser = metrics.topLosers[0];
      expect(topLoser?.symbol).toBe('GOOGL');
    });

    it('should calculate market cap distribution', async () => {
      const response = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.portfolioMetrics.marketCapDistribution).toBeDefined();

      const marketCapDist = response.body.data.portfolioMetrics.marketCapDistribution;
      expect(marketCapDist.largeCap).toBeDefined();
      expect(marketCapDist.midCap).toBeDefined();
      expect(marketCapDist.smallCap).toBeDefined();
    });

    it('should handle empty portfolio', async () => {
      // Clean up positions
      await testPrisma.stockPosition.deleteMany({
        where: { userId: testUser.id }
      });

      const response = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      const metrics = response.body.data.portfolioMetrics;
      expect(metrics.totalValue).toBe(0);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.topPerformers).toHaveLength(0);
      expect(metrics.topLosers).toHaveLength(0);
    });
  });

  describe('GET /api/analytics/historical', () => {
    beforeEach(async () => {
      // Create test positions
      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50
      });

      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'GOOGL',
        quantity: 5,
        purchasePrice: 2800.00
      });
    });

    it('should return historical performance data', async () => {
      const response = await request(app)
        .get('/api/analytics/historical?period=1M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.historicalData).toBeDefined();
      expect(Array.isArray(response.body.data.historicalData)).toBe(true);

      // Verify market data service was called for each symbol
      expect(mockMarketDataService.getHistoricalData).toHaveBeenCalledWith('AAPL', '1M');
      expect(mockMarketDataService.getHistoricalData).toHaveBeenCalledWith('GOOGL', '1M');
    });

    it('should validate period parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/historical?period=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid period');
    });

    it('should default to 1M period if not specified', async () => {
      const response = await request(app)
        .get('/api/analytics/historical')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockMarketDataService.getHistoricalData).toHaveBeenCalledWith('AAPL', '1M');
    });

    it('should handle market data service errors', async () => {
      mockMarketDataService.getHistoricalData.mockRejectedValue(
        new Error('Historical data unavailable')
      );

      const response = await request(app)
        .get('/api/analytics/historical?period=1M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/analytics/benchmark', () => {
    beforeEach(async () => {
      // Create test positions
      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 145.50,
        currentPrice: 155.00
      });

      // Mock benchmark data
      mockMarketDataService.getHistoricalData.mockImplementation((symbol, period) => {
        if (symbol === 'SPY') {
          return Promise.resolve([
            { date: new Date('2024-01-01'), open: 449.00, high: 451.00, low: 448.00, close: 450.00, volume: 100000000 },
            { date: new Date('2024-01-02'), open: 450.00, high: 453.00, low: 449.00, close: 452.00, volume: 95000000 },
            { date: new Date('2024-01-03'), open: 452.00, high: 456.00, low: 451.00, close: 455.00, volume: 98000000 }
          ]);
        }
        return Promise.resolve([
          { date: new Date('2024-01-01'), open: 149.00, high: 151.00, low: 148.00, close: 150.00, volume: 50000000 },
          { date: new Date('2024-01-02'), open: 150.00, high: 153.00, low: 149.00, close: 152.00, volume: 45000000 },
          { date: new Date('2024-01-03'), open: 152.00, high: 156.00, low: 151.00, close: 155.00, volume: 48000000 }
        ]);
      });
    });

    it('should return benchmark comparison', async () => {
      const response = await request(app)
        .get('/api/analytics/benchmark?benchmark=SPY&period=1M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.benchmarkComparison).toBeDefined();

      const comparison = response.body.data.benchmarkComparison;
      expect(comparison.portfolioReturn).toBeDefined();
      expect(comparison.benchmarkReturn).toBeDefined();
      expect(comparison.outperformance).toBeDefined();
      expect(comparison.correlation).toBeDefined();

      // Verify market data was fetched for benchmark
      expect(mockMarketDataService.getHistoricalData).toHaveBeenCalledWith('SPY', '1M');
    });

    it('should default to SPY benchmark', async () => {
      const response = await request(app)
        .get('/api/analytics/benchmark?period=1M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockMarketDataService.getHistoricalData).toHaveBeenCalledWith('SPY', '1M');
    });

    it('should validate benchmark symbol', async () => {
      const response = await request(app)
        .get('/api/analytics/benchmark?benchmark=INVALID&period=1M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid benchmark');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        '/api/analytics/sectors',
        '/api/analytics/performance',
        '/api/analytics/historical',
        '/api/analytics/benchmark'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('token required');
      }
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });
  });

  describe('Database Performance and Optimization', () => {
    it('should efficiently handle large portfolios', async () => {
      // Create a large number of positions
      const positions = [];
      for (let i = 0; i < 100; i++) {
        positions.push({
          userId: testUser.id,
          symbol: `STOCK${i}`,
          companyName: `Company ${i}`,
          quantity: Math.floor(Math.random() * 100) + 1,
          purchasePrice: Math.random() * 1000 + 50,
          currentPrice: Math.random() * 1000 + 50,
          purchaseDate: new Date(),
          sector: ['Technology', 'Healthcare', 'Finance'][i % 3],
          marketCap: ['Large Cap', 'Mid Cap', 'Small Cap'][i % 3]
        });
      }

      await testPrisma.stockPosition.createMany({
        data: positions
      });

      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body.success).toBe(true);
      expect(response.body.data.sectorAllocation).toHaveLength(3);
      
      // Should complete within reasonable time (< 2 seconds)
      expect(responseTime).toBeLessThan(2000);
    });

    it('should use database indexes effectively', async () => {
      // Create positions with same userId (should use userId index)
      await testDb.createTestStockPosition(testUser.id, { symbol: 'AAPL' });
      await testDb.createTestStockPosition(testUser.id, { symbol: 'GOOGL' });
      await testDb.createTestStockPosition(testUser.id, { symbol: 'MSFT' });

      // This query should be fast due to userId index
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body.success).toBe(true);
      expect(responseTime).toBeLessThan(1000); // Should be very fast with proper indexing
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle positions with missing current prices', async () => {
      await testDb.createTestStockPosition(testUser.id, {
        symbol: 'AAPL',
        currentPrice: null // Missing current price
      });

      const response = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should handle gracefully, possibly using purchase price or fetching current price
    });

    it('should handle database connection errors', async () => {
      // Mock database error
      const originalFindMany = testPrisma.stockPosition.findMany;
      testPrisma.stockPosition.findMany = jest.fn().mockRejectedValue(
        new Error('Database connection lost')
      );

      try {
        const response = await request(app)
          .get('/api/analytics/sectors')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();

      } finally {
        // Restore original method
        testPrisma.stockPosition.findMany = originalFindMany;
      }
    });

    it('should handle market data service timeouts', async () => {
      mockMarketDataService.getBatchPrices.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const response = await request(app)
        .get('/api/analytics/historical?period=1M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('timeout');
    });
  });
});