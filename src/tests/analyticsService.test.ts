// Mock all dependencies before importing
jest.mock('../lib/database');
jest.mock('../services/marketDataService');

import { AnalyticsService } from '../services/analyticsService';
import { prisma } from '../lib/database';
import { marketDataService } from '../services/marketDataService';
import { Portfolio, StockPosition, HistoricalPrice } from '../types';

// Mock implementations
const mockPrisma = {
  stockPosition: {
    findMany: jest.fn(),
  },
};

const mockMarketDataService = {
  getBatchPrices: jest.fn(),
  getHistoricalData: jest.fn(),
};

// Apply mocks
(prisma as any) = mockPrisma;
(marketDataService as any) = mockMarketDataService;

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    analyticsService = new AnalyticsService();
  });

  describe('calculateSectorAllocation', () => {
    it('should return empty array for empty portfolio', async () => {
      const emptyPortfolio: Portfolio = {
        userId: 'user-123',
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date(),
      };

      const result = await analyticsService.calculateSectorAllocation(emptyPortfolio);

      expect(result).toEqual([]);
    });

    it('should calculate sector allocation correctly', async () => {
      const mockPositions: StockPosition[] = [
        {
          id: 'pos-1',
          userId: 'user-123',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date(),
          currentPrice: 160.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'pos-2',
          userId: 'user-123',
          symbol: 'GOOGL',
          companyName: 'Alphabet Inc.',
          quantity: 5,
          purchasePrice: 2500.00,
          purchaseDate: new Date(),
          currentPrice: 2600.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'pos-3',
          userId: 'user-123',
          symbol: 'JPM',
          companyName: 'JPMorgan Chase',
          quantity: 8,
          purchasePrice: 140.00,
          purchaseDate: new Date(),
          currentPrice: 145.00,
          sector: 'Financial Services',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const portfolio: Portfolio = {
        userId: 'user-123',
        positions: mockPositions,
        totalValue: 10 * 160 + 5 * 2600 + 8 * 145, // 1600 + 13000 + 1160 = 15760
        totalCost: 10 * 150 + 5 * 2500 + 8 * 140, // 1500 + 12500 + 1120 = 15120
        unrealizedGainLoss: 640,
        unrealizedGainLossPercent: 4.23,
        lastUpdated: new Date(),
      };

      const result = await analyticsService.calculateSectorAllocation(portfolio);

      expect(result).toHaveLength(2);
      
      // Technology sector should be first (higher value)
      expect(result[0]).toEqual({
        sector: 'Technology',
        value: 14600, // 1600 + 13000
        percentage: (14600 / 15760) * 100,
        positions: 2,
      });

      // Financial Services sector should be second
      expect(result[1]).toEqual({
        sector: 'Financial Services',
        value: 1160,
        percentage: (1160 / 15760) * 100,
        positions: 1,
      });
    });

    it('should handle positions with unknown sectors', async () => {
      const mockPositions: StockPosition[] = [
        {
          id: 'pos-1',
          userId: 'user-123',
          symbol: 'UNKNOWN',
          companyName: 'Unknown Company',
          quantity: 10,
          purchasePrice: 100.00,
          purchaseDate: new Date(),
          currentPrice: 110.00,
          sector: null,
          marketCap: 'Small Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const portfolio: Portfolio = {
        userId: 'user-123',
        positions: mockPositions,
        totalValue: 1100,
        totalCost: 1000,
        unrealizedGainLoss: 100,
        unrealizedGainLossPercent: 10,
        lastUpdated: new Date(),
      };

      const result = await analyticsService.calculateSectorAllocation(portfolio);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sector: 'Unknown',
        value: 1100,
        percentage: 100,
        positions: 1,
      });
    });
  });

  describe('calculateMarketCapDistribution', () => {
    it('should return empty distribution for empty portfolio', async () => {
      const emptyPortfolio: Portfolio = {
        userId: 'user-123',
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date(),
      };

      const result = await analyticsService.calculateMarketCapDistribution(emptyPortfolio);

      expect(result).toEqual({
        largeCap: { value: 0, percentage: 0, count: 0 },
        midCap: { value: 0, percentage: 0, count: 0 },
        smallCap: { value: 0, percentage: 0, count: 0 },
      });
    });

    it('should calculate market cap distribution correctly', async () => {
      const mockPositions: StockPosition[] = [
        {
          id: 'pos-1',
          userId: 'user-123',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date(),
          currentPrice: 160.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'pos-2',
          userId: 'user-123',
          symbol: 'MID',
          companyName: 'Mid Cap Company',
          quantity: 20,
          purchasePrice: 50.00,
          purchaseDate: new Date(),
          currentPrice: 55.00,
          sector: 'Healthcare',
          marketCap: 'Mid Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'pos-3',
          userId: 'user-123',
          symbol: 'SMALL',
          companyName: 'Small Cap Company',
          quantity: 100,
          purchasePrice: 10.00,
          purchaseDate: new Date(),
          currentPrice: 12.00,
          sector: 'Energy',
          marketCap: 'Small Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const totalValue = 10 * 160 + 20 * 55 + 100 * 12; // 1600 + 1100 + 1200 = 3900

      const portfolio: Portfolio = {
        userId: 'user-123',
        positions: mockPositions,
        totalValue,
        totalCost: 10 * 150 + 20 * 50 + 100 * 10,
        unrealizedGainLoss: 400,
        unrealizedGainLossPercent: 10.26,
        lastUpdated: new Date(),
      };

      const result = await analyticsService.calculateMarketCapDistribution(portfolio);

      expect(result.largeCap).toEqual({
        value: 1600,
        percentage: (1600 / 3900) * 100,
        count: 1,
      });

      expect(result.midCap).toEqual({
        value: 1100,
        percentage: (1100 / 3900) * 100,
        count: 1,
      });

      expect(result.smallCap).toEqual({
        value: 1200,
        percentage: (1200 / 3900) * 100,
        count: 1,
      });
    });

    it('should default unknown market cap to large cap', async () => {
      const mockPositions: StockPosition[] = [
        {
          id: 'pos-1',
          userId: 'user-123',
          symbol: 'UNKNOWN',
          companyName: 'Unknown Company',
          quantity: 10,
          purchasePrice: 100.00,
          purchaseDate: new Date(),
          currentPrice: 110.00,
          sector: 'Technology',
          marketCap: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const portfolio: Portfolio = {
        userId: 'user-123',
        positions: mockPositions,
        totalValue: 1100,
        totalCost: 1000,
        unrealizedGainLoss: 100,
        unrealizedGainLossPercent: 10,
        lastUpdated: new Date(),
      };

      const result = await analyticsService.calculateMarketCapDistribution(portfolio);

      expect(result.largeCap).toEqual({
        value: 1100,
        percentage: 100,
        count: 1,
      });

      expect(result.midCap.count).toBe(0);
      expect(result.smallCap.count).toBe(0);
    });
  });

  describe('generatePerformanceReport', () => {
    const mockUserId = 'user-123';

    it('should return empty report for user with no positions', async () => {
      mockPrisma.stockPosition.findMany.mockResolvedValue([]);

      const result = await analyticsService.generatePerformanceReport(mockUserId);

      expect(result).toEqual({
        period: '1mo',
        startValue: 0,
        endValue: 0,
        totalReturn: 0,
        totalReturnPercent: 0,
        sectorPerformance: [],
      });
    });

    it('should generate comprehensive performance report', async () => {
      const mockPositions: StockPosition[] = [
        {
          id: 'pos-1',
          userId: mockUserId,
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date(),
          currentPrice: 160.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'pos-2',
          userId: mockUserId,
          symbol: 'JPM',
          companyName: 'JPMorgan Chase',
          quantity: 5,
          purchasePrice: 140.00,
          purchaseDate: new Date(),
          currentPrice: 135.00,
          sector: 'Financial Services',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.stockPosition.findMany.mockResolvedValue(mockPositions);
      mockMarketDataService.getBatchPrices.mockResolvedValue([
        { symbol: 'AAPL', price: 165.00, change: 5.00, changePercent: 3.13, lastUpdated: new Date() },
        { symbol: 'JPM', price: 130.00, change: -5.00, changePercent: -3.70, lastUpdated: new Date() },
      ]);

      const result = await analyticsService.generatePerformanceReport(mockUserId, { 
        period: '1mo', 
        startDate: new Date('2024-01-01'), 
        endDate: new Date('2024-02-01') 
      });

      expect(result.period).toBe('1mo');
      expect(result.startValue).toBe(10 * 150 + 5 * 140); // 1500 + 700 = 2200
      expect(result.endValue).toBe(10 * 165 + 5 * 130); // 1650 + 650 = 2300
      expect(result.totalReturn).toBe(100); // 2300 - 2200
      expect(result.totalReturnPercent).toBeCloseTo(4.55, 2); // (100/2200) * 100

      expect(result.sectorPerformance).toHaveLength(2);
      expect(result.sectorPerformance[0].sector).toBe('Technology'); // Better performer
      expect(result.sectorPerformance[1].sector).toBe('Financial Services'); // Worse performer
    });

    it('should handle price fetch failures gracefully', async () => {
      const mockPositions: StockPosition[] = [
        {
          id: 'pos-1',
          userId: mockUserId,
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date(),
          currentPrice: 160.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.stockPosition.findMany.mockResolvedValue(mockPositions);
      mockMarketDataService.getBatchPrices.mockRejectedValue(new Error('API Error'));

      const result = await analyticsService.generatePerformanceReport(mockUserId);

      expect(result.endValue).toBe(10 * 160); // Uses existing currentPrice
      expect(result.startValue).toBe(10 * 150); // Uses purchasePrice
    });
  });

  describe('compareWithBenchmark', () => {
    const mockPortfolio: Portfolio = {
      userId: 'user-123',
      positions: [
        {
          id: 'pos-1',
          userId: 'user-123',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date(),
          currentPrice: 165.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      totalValue: 1650,
      totalCost: 1500,
      unrealizedGainLoss: 150,
      unrealizedGainLossPercent: 10.0,
      lastUpdated: new Date(),
    };

    it('should compare portfolio with benchmark successfully', async () => {
      const mockBenchmarkData: HistoricalPrice[] = [
        {
          date: new Date('2024-02-01'),
          open: 420,
          high: 425,
          low: 415,
          close: 422,
          volume: 1000000,
        },
        {
          date: new Date('2024-01-01'),
          open: 400,
          high: 405,
          low: 395,
          close: 400,
          volume: 1000000,
        },
      ];

      mockMarketDataService.getHistoricalData.mockResolvedValue(mockBenchmarkData);

      const result = await analyticsService.compareWithBenchmark(mockPortfolio, 'SPY');

      expect(mockMarketDataService.getHistoricalData).toHaveBeenCalledWith('SPY', '1mo');

      expect(result.portfolioReturn).toBe(10.0);
      expect(result.benchmarkReturn).toBeCloseTo(5.5, 1); // (422-400)/400 * 100
      expect(result.outperformance).toBeCloseTo(4.5, 1); // 10.0 - 5.5
      expect(result.correlation).toBeGreaterThan(0);
      expect(result.beta).toBeGreaterThan(0);
    });

    it('should throw error when insufficient benchmark data', async () => {
      mockMarketDataService.getHistoricalData.mockResolvedValue([
        {
          date: new Date('2024-02-01'),
          open: 420,
          high: 425,
          low: 415,
          close: 422,
          volume: 1000000,
        },
      ]);

      await expect(
        analyticsService.compareWithBenchmark(mockPortfolio, 'SPY')
      ).rejects.toThrow('Unable to compare with benchmark SPY');
    });

    it('should throw error when benchmark data fetch fails', async () => {
      mockMarketDataService.getHistoricalData.mockRejectedValue(new Error('API Error'));

      await expect(
        analyticsService.compareWithBenchmark(mockPortfolio, 'SPY')
      ).rejects.toThrow('Unable to compare with benchmark SPY');
    });
  });

  describe('market cap classification helpers', () => {
    it('should correctly classify large cap stocks', () => {
      const service = new AnalyticsService();
      
      // Access private method through type assertion for testing
      const isLargeCap = (service as any).isLargeCap.bind(service);
      
      expect(isLargeCap('Large Cap')).toBe(true);
      expect(isLargeCap('Mega Cap')).toBe(true);
      expect(isLargeCap('Giant Cap')).toBe(true);
      expect(isLargeCap('Mid Cap')).toBe(false);
      expect(isLargeCap('Small Cap')).toBe(false);
    });

    it('should correctly classify mid cap stocks', () => {
      const service = new AnalyticsService();
      const isMidCap = (service as any).isMidCap.bind(service);
      
      expect(isMidCap('Mid Cap')).toBe(true);
      expect(isMidCap('Large Cap')).toBe(false);
      expect(isMidCap('Small Cap')).toBe(false);
    });

    it('should correctly classify small cap stocks', () => {
      const service = new AnalyticsService();
      const isSmallCap = (service as any).isSmallCap.bind(service);
      
      expect(isSmallCap('Small Cap')).toBe(true);
      expect(isSmallCap('Micro Cap')).toBe(true);
      expect(isSmallCap('Nano Cap')).toBe(true);
      expect(isSmallCap('Large Cap')).toBe(false);
      expect(isSmallCap('Mid Cap')).toBe(false);
    });
  });
});