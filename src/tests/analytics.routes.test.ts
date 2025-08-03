// Mock all dependencies before importing
jest.mock('../lib/database');
jest.mock('../services/marketDataService');
jest.mock('../services/portfolioService');
jest.mock('../services/analyticsService');
jest.mock('../middleware/auth');

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import analyticsRoutes from '../routes/analytics';
import { portfolioService } from '../services/portfolioService';
import { analyticsService } from '../services/analyticsService';
import { authenticateToken } from '../middleware/auth';

// Mock implementations
const mockPortfolioService = portfolioService as jest.Mocked<typeof portfolioService>;
const mockAnalyticsService = analyticsService as jest.Mocked<typeof analyticsService>;
const mockAuthenticateToken = authenticateToken as jest.MockedFunction<typeof authenticateToken>;

// Create test app
const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);

describe('Analytics Routes', () => {
  const mockUserId = 'test-user-123';
  let authToken: string;

  beforeAll(() => {
    // Generate auth token directly using jwt
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    authToken = jwt.sign({ userId: mockUserId }, JWT_SECRET, { expiresIn: '24h' });
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock authentication middleware to pass through with mock user
    mockAuthenticateToken.mockImplementation(async (req: any, res: any, next: any) => {
      req.user = { id: mockUserId };
      next();
    });
  });

  describe('GET /api/analytics/sectors', () => {
    it('should retrieve sector allocation successfully', async () => {
      const mockPortfolio = {
        userId: mockUserId,
        positions: [
          {
            id: 'position-1',
            userId: mockUserId,
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 145.50,
            purchaseDate: new Date('2024-01-15'),
            currentPrice: 150.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        ],
        totalValue: 1500,
        totalCost: 1455,
        unrealizedGainLoss: 45,
        unrealizedGainLossPercent: 3.09,
        lastUpdated: new Date()
      };

      const mockSectorAllocation = [
        {
          sector: 'Technology',
          value: 1500,
          percentage: 100,
          positions: 1
        }
      ];

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockAnalyticsService.calculateSectorAllocation.mockResolvedValue(mockSectorAllocation);

      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSectorAllocation);
      expect(response.body.message).toBe('Sector allocation retrieved successfully');

      expect(mockPortfolioService.getPortfolio).toHaveBeenCalledWith(mockUserId);
      expect(mockAnalyticsService.calculateSectorAllocation).toHaveBeenCalledWith(mockPortfolio);
    });

    it('should return empty array for portfolio with no positions', async () => {
      const mockEmptyPortfolio = {
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockEmptyPortfolio);

      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.message).toBe('No positions found for sector analysis');
    });

    it('should return 401 without authentication', async () => {
      // Mock authentication middleware to reject
      mockAuthenticateToken.mockImplementation(async (req: any, res: any, next: any) => {
        res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      });

      const response = await request(app)
        .get('/api/analytics/sectors')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('GET /api/analytics/performance', () => {
    it('should retrieve portfolio performance metrics successfully', async () => {
      const mockPortfolioMetrics = {
        totalValue: 15750,
        dailyChange: 125.50,
        dailyChangePercent: 0.80,
        totalReturn: 295,
        totalReturnPercent: 1.91,
        sectorAllocation: [
          {
            sector: 'Technology',
            value: 15750,
            percentage: 100,
            positions: 2
          }
        ],
        marketCapDistribution: {
          largeCap: { value: 15750, percentage: 100, count: 2 },
          midCap: { value: 0, percentage: 0, count: 0 },
          smallCap: { value: 0, percentage: 0, count: 0 }
        },
        topPerformers: [],
        topLosers: []
      };

      mockPortfolioService.calculatePortfolioMetrics.mockResolvedValue(mockPortfolioMetrics);

      const response = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockPortfolioMetrics);
      expect(response.body.message).toBe('Portfolio performance metrics retrieved successfully');

      expect(mockPortfolioService.calculatePortfolioMetrics).toHaveBeenCalledWith(mockUserId);
    });

    it('should handle service errors gracefully', async () => {
      mockPortfolioService.calculatePortfolioMetrics.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/analytics/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/analytics/historical', () => {
    it('should retrieve historical performance with default period', async () => {
      const mockPerformanceReport = {
        period: '1m',
        startValue: 15000,
        endValue: 15750,
        totalReturn: 750,
        totalReturnPercent: 5.0,
        sectorPerformance: [
          {
            sector: 'Technology',
            return: 750,
            returnPercent: 5.0,
            contribution: 100
          }
        ]
      };

      mockAnalyticsService.generatePerformanceReport.mockResolvedValue(mockPerformanceReport);

      const response = await request(app)
        .get('/api/analytics/historical')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockPerformanceReport);
      expect(response.body.message).toBe('Historical performance data retrieved successfully');

      expect(mockAnalyticsService.generatePerformanceReport).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          period: '1m',
          startDate: expect.any(Date),
          endDate: expect.any(Date)
        })
      );
    });

    it('should retrieve historical performance with custom period', async () => {
      const mockPerformanceReport = {
        period: '6m',
        startValue: 12000,
        endValue: 15750,
        totalReturn: 3750,
        totalReturnPercent: 31.25,
        sectorPerformance: []
      };

      mockAnalyticsService.generatePerformanceReport.mockResolvedValue(mockPerformanceReport);

      const response = await request(app)
        .get('/api/analytics/historical?period=6m')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockPerformanceReport);

      expect(mockAnalyticsService.generatePerformanceReport).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          period: '6m'
        })
      );
    });

    it('should retrieve historical performance with custom date range', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-02-01T00:00:00.000Z';

      const mockPerformanceReport = {
        period: '1m',
        startValue: 14000,
        endValue: 15750,
        totalReturn: 1750,
        totalReturnPercent: 12.5,
        sectorPerformance: []
      };

      mockAnalyticsService.generatePerformanceReport.mockResolvedValue(mockPerformanceReport);

      const response = await request(app)
        .get(`/api/analytics/historical?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockPerformanceReport);

      expect(mockAnalyticsService.generatePerformanceReport).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        })
      );
    });

    it('should return 400 for invalid period', async () => {
      const response = await request(app)
        .get('/api/analytics/historical?period=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for invalid date range', async () => {
      const startDate = '2024-02-01T00:00:00.000Z';
      const endDate = '2024-01-01T00:00:00.000Z'; // End before start

      const response = await request(app)
        .get(`/api/analytics/historical?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toBeDefined();
    });
  });

  describe('GET /api/analytics/benchmark', () => {
    it('should retrieve benchmark comparison successfully', async () => {
      const mockPortfolio = {
        userId: mockUserId,
        positions: [
          {
            id: 'position-1',
            userId: mockUserId,
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 145.50,
            purchaseDate: new Date('2024-01-15'),
            currentPrice: 150.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        ],
        totalValue: 1500,
        totalCost: 1455,
        unrealizedGainLoss: 45,
        unrealizedGainLossPercent: 3.09,
        lastUpdated: new Date()
      };

      const mockBenchmarkComparison = {
        portfolioReturn: 3.09,
        benchmarkReturn: 2.5,
        outperformance: 0.59,
        correlation: 0.85,
        beta: 1.1
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockAnalyticsService.compareWithBenchmark.mockResolvedValue(mockBenchmarkComparison);

      const response = await request(app)
        .get('/api/analytics/benchmark')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockBenchmarkComparison);
      expect(response.body.message).toBe('Benchmark comparison retrieved successfully');

      expect(mockAnalyticsService.compareWithBenchmark).toHaveBeenCalledWith(
        mockPortfolio,
        'SPY',
        '1m'
      );
    });

    it('should return empty comparison for portfolio with no positions', async () => {
      const mockEmptyPortfolio = {
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockEmptyPortfolio);

      const response = await request(app)
        .get('/api/analytics/benchmark')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        portfolioReturn: 0,
        benchmarkReturn: 0,
        outperformance: 0,
        correlation: 0,
        beta: 0
      });
      expect(response.body.message).toBe('No positions found for benchmark comparison');
    });

    it('should use custom benchmark and period', async () => {
      const mockPortfolio = {
        userId: mockUserId,
        positions: [
          {
            id: 'position-1',
            userId: mockUserId,
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 145.50,
            purchaseDate: new Date('2024-01-15'),
            currentPrice: 150.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        ],
        totalValue: 1500,
        totalCost: 1455,
        unrealizedGainLoss: 45,
        unrealizedGainLossPercent: 3.09,
        lastUpdated: new Date()
      };

      const mockBenchmarkComparison = {
        portfolioReturn: 3.09,
        benchmarkReturn: 1.8,
        outperformance: 1.29,
        correlation: 0.75,
        beta: 1.2
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockAnalyticsService.compareWithBenchmark.mockResolvedValue(mockBenchmarkComparison);

      const response = await request(app)
        .get('/api/analytics/benchmark?benchmark=QQQ&period=3m')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockBenchmarkComparison);

      expect(mockAnalyticsService.compareWithBenchmark).toHaveBeenCalledWith(
        mockPortfolio,
        'QQQ',
        '3m'
      );
    });
  });

  describe('GET /api/analytics/summary', () => {
    it('should retrieve comprehensive analytics summary successfully', async () => {
      const mockPortfolio = {
        userId: mockUserId,
        positions: [
          {
            id: 'position-1',
            userId: mockUserId,
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 145.50,
            purchaseDate: new Date('2024-01-15'),
            currentPrice: 150.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        ],
        totalValue: 1500,
        totalCost: 1455,
        unrealizedGainLoss: 45,
        unrealizedGainLossPercent: 3.09,
        lastUpdated: new Date()
      };

      const mockPortfolioMetrics = {
        totalValue: 1500,
        dailyChange: 25.50,
        dailyChangePercent: 1.73,
        totalReturn: 45,
        totalReturnPercent: 3.09,
        sectorAllocation: [
          {
            sector: 'Technology',
            value: 1500,
            percentage: 100,
            positions: 1
          }
        ],
        marketCapDistribution: {
          largeCap: { value: 1500, percentage: 100, count: 1 },
          midCap: { value: 0, percentage: 0, count: 0 },
          smallCap: { value: 0, percentage: 0, count: 0 }
        },
        topPerformers: [mockPortfolio.positions[0]],
        topLosers: []
      };

      const mockSectorAllocation = [
        {
          sector: 'Technology',
          value: 1500,
          percentage: 100,
          positions: 1
        }
      ];

      const mockBenchmarkComparison = {
        portfolioReturn: 3.09,
        benchmarkReturn: 2.5,
        outperformance: 0.59,
        correlation: 0.85,
        beta: 1.1
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockPortfolioService.calculatePortfolioMetrics.mockResolvedValue(mockPortfolioMetrics);
      mockAnalyticsService.calculateSectorAllocation.mockResolvedValue(mockSectorAllocation);
      mockAnalyticsService.compareWithBenchmark.mockResolvedValue(mockBenchmarkComparison);

      const response = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        portfolio: {
          totalValue: 1500,
          totalCost: 1455,
          unrealizedGainLoss: 45,
          unrealizedGainLossPercent: 3.09,
          positionCount: 1
        },
        performance: {
          dailyChange: 25.50,
          dailyChangePercent: 1.73,
          totalReturn: 45,
          totalReturnPercent: 3.09
        },
        allocation: {
          sectors: mockSectorAllocation,
          marketCap: mockPortfolioMetrics.marketCapDistribution
        },
        topPositions: {
          performers: [expect.objectContaining({
            id: 'position-1',
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 145.50,
            currentPrice: 150.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            userId: mockUserId
          })],
          losers: []
        },
        benchmark: mockBenchmarkComparison
      });
      expect(response.body.message).toBe('Portfolio analytics summary retrieved successfully');
    });

    it('should handle empty portfolio gracefully', async () => {
      const mockEmptyPortfolio = {
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date()
      };

      const mockEmptyMetrics = {
        totalValue: 0,
        dailyChange: 0,
        dailyChangePercent: 0,
        totalReturn: 0,
        totalReturnPercent: 0,
        sectorAllocation: [],
        marketCapDistribution: {
          largeCap: { value: 0, percentage: 0, count: 0 },
          midCap: { value: 0, percentage: 0, count: 0 },
          smallCap: { value: 0, percentage: 0, count: 0 }
        },
        topPerformers: [],
        topLosers: []
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockEmptyPortfolio);
      mockPortfolioService.calculatePortfolioMetrics.mockResolvedValue(mockEmptyMetrics);

      const response = await request(app)
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.portfolio.positionCount).toBe(0);
      expect(response.body.data.allocation.sectors).toEqual([]);
      expect(response.body.data.benchmark).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle portfolio service errors gracefully', async () => {
      mockPortfolioService.getPortfolio.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle analytics service errors gracefully', async () => {
      const mockPortfolio = {
        userId: mockUserId,
        positions: [
          {
            id: 'position-1',
            userId: mockUserId,
            symbol: 'AAPL',
            companyName: 'Apple Inc.',
            quantity: 10,
            purchasePrice: 145.50,
            purchaseDate: new Date('2024-01-15'),
            currentPrice: 150.00,
            sector: 'Technology',
            marketCap: 'Large Cap',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        ],
        totalValue: 1500,
        totalCost: 1455,
        unrealizedGainLoss: 45,
        unrealizedGainLossPercent: 3.09,
        lastUpdated: new Date()
      };

      mockPortfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
      mockAnalyticsService.calculateSectorAllocation.mockRejectedValue(new Error('Analytics error'));

      const response = await request(app)
        .get('/api/analytics/sectors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});