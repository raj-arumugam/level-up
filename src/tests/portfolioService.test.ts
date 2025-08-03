// Mock all dependencies before importing
jest.mock('../lib/database');
jest.mock('../services/marketDataService');

import { PortfolioService } from '../services/portfolioService';
import { prisma } from '../lib/database';
import { marketDataService } from '../services/marketDataService';
import { CreatePositionDto, UpdatePositionDto, StockPosition } from '../types';

// Mock implementations
const mockPrisma = {
  stockPosition: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  marketData: {
    findUnique: jest.fn(),
  },
};

const mockMarketDataService = {
  validateSymbol: jest.fn(),
  getCurrentPrice: jest.fn(),
  getBatchPrices: jest.fn(),
};

// Apply mocks
(prisma as any) = mockPrisma;
(marketDataService as any) = mockMarketDataService;

describe('PortfolioService', () => {
  let portfolioService: PortfolioService;

  beforeEach(() => {
    jest.clearAllMocks();
    portfolioService = new PortfolioService();
  });

  describe('addPosition', () => {
    const mockUserId = 'user-123';
    const mockPositionData: CreatePositionDto = {
      symbol: 'AAPL',
      quantity: 10,
      purchasePrice: 150.00,
      purchaseDate: new Date('2024-01-15'),
    };

    const mockCreatedPosition: StockPosition = {
      id: 'position-123',
      userId: mockUserId,
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      quantity: 10,
      purchasePrice: 150.00,
      purchaseDate: new Date('2024-01-15'),
      currentPrice: 160.00,
      sector: 'Technology',
      marketCap: 'Large Cap',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully add a new position', async () => {
      // Mock symbol validation
      mockMarketDataService.validateSymbol.mockResolvedValue(true);
      
      // Mock current price fetch
      mockMarketDataService.getCurrentPrice.mockResolvedValue({
        symbol: 'AAPL',
        price: 160.00,
        change: 5.00,
        changePercent: 3.23,
        lastUpdated: new Date(),
      });

      // Mock market data lookup
      mockPrisma.marketData.findUnique.mockResolvedValue({
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        sector: 'Technology',
        marketCap: 'Large Cap',
      });

      // Mock position creation
      mockPrisma.stockPosition.create.mockResolvedValue(mockCreatedPosition);

      const result = await portfolioService.addPosition(mockUserId, mockPositionData);

      expect(mockMarketDataService.validateSymbol).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.getCurrentPrice).toHaveBeenCalledWith('AAPL');
      expect(mockPrisma.marketData.findUnique).toHaveBeenCalledWith({
        where: { symbol: 'AAPL' }
      });
      expect(mockPrisma.stockPosition.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date('2024-01-15'),
          currentPrice: 160.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
        }
      });

      expect(result).toEqual(mockCreatedPosition);
    });

    it('should throw error for invalid stock symbol', async () => {
      mockMarketDataService.validateSymbol.mockResolvedValue(false);

      await expect(
        portfolioService.addPosition(mockUserId, mockPositionData)
      ).rejects.toThrow('Invalid stock symbol: AAPL');

      expect(mockPrisma.stockPosition.create).not.toHaveBeenCalled();
    });

    it('should throw error for invalid quantity', async () => {
      const invalidPositionData = { ...mockPositionData, quantity: 0 };

      await expect(
        portfolioService.addPosition(mockUserId, invalidPositionData)
      ).rejects.toThrow('Quantity must be greater than 0');
    });

    it('should throw error for invalid purchase price', async () => {
      const invalidPositionData = { ...mockPositionData, purchasePrice: -10 };

      await expect(
        portfolioService.addPosition(mockUserId, invalidPositionData)
      ).rejects.toThrow('Purchase price must be greater than 0');
    });

    it('should throw error for future purchase date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const invalidPositionData = { ...mockPositionData, purchaseDate: futureDate };

      await expect(
        portfolioService.addPosition(mockUserId, invalidPositionData)
      ).rejects.toThrow('Purchase date cannot be in the future');
    });

    it('should handle market data fetch failure gracefully', async () => {
      mockMarketDataService.validateSymbol.mockResolvedValue(true);
      mockMarketDataService.getCurrentPrice.mockRejectedValue(new Error('API Error'));
      mockPrisma.marketData.findUnique.mockResolvedValue(null);

      const expectedPosition = {
        ...mockCreatedPosition,
        companyName: 'AAPL',
        currentPrice: undefined,
        sector: undefined,
        marketCap: undefined,
      };

      mockPrisma.stockPosition.create.mockResolvedValue(expectedPosition);

      const result = await portfolioService.addPosition(mockUserId, mockPositionData);

      expect(result).toEqual(expectedPosition);
      expect(mockPrisma.stockPosition.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          symbol: 'AAPL',
          companyName: 'AAPL',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date('2024-01-15'),
          currentPrice: undefined,
          sector: undefined,
          marketCap: undefined,
        }
      });
    });
  });

  describe('updatePosition', () => {
    const mockPositionId = 'position-123';
    const mockExistingPosition: StockPosition = {
      id: mockPositionId,
      userId: 'user-123',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      quantity: 10,
      purchasePrice: 150.00,
      purchaseDate: new Date('2024-01-15'),
      currentPrice: 160.00,
      sector: 'Technology',
      marketCap: 'Large Cap',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully update position', async () => {
      const updateData: UpdatePositionDto = {
        quantity: 15,
        purchasePrice: 145.00,
      };

      const updatedPosition = {
        ...mockExistingPosition,
        quantity: 15,
        purchasePrice: 145.00,
        updatedAt: new Date(),
      };

      mockPrisma.stockPosition.findUnique.mockResolvedValue(mockExistingPosition);
      mockPrisma.stockPosition.update.mockResolvedValue(updatedPosition);

      const result = await portfolioService.updatePosition(mockPositionId, updateData);

      expect(mockPrisma.stockPosition.findUnique).toHaveBeenCalledWith({
        where: { id: mockPositionId }
      });
      expect(mockPrisma.stockPosition.update).toHaveBeenCalledWith({
        where: { id: mockPositionId },
        data: {
          quantity: 15,
          purchasePrice: 145.00,
          updatedAt: expect.any(Date),
        }
      });

      expect(result).toEqual(updatedPosition);
    });

    it('should throw error if position not found', async () => {
      mockPrisma.stockPosition.findUnique.mockResolvedValue(null);

      await expect(
        portfolioService.updatePosition(mockPositionId, { quantity: 15 })
      ).rejects.toThrow(`Stock position with ID ${mockPositionId} not found`);

      expect(mockPrisma.stockPosition.update).not.toHaveBeenCalled();
    });

    it('should throw error for invalid quantity update', async () => {
      mockPrisma.stockPosition.findUnique.mockResolvedValue(mockExistingPosition);

      await expect(
        portfolioService.updatePosition(mockPositionId, { quantity: 0 })
      ).rejects.toThrow('Quantity must be greater than 0');
    });

    it('should throw error for invalid purchase price update', async () => {
      mockPrisma.stockPosition.findUnique.mockResolvedValue(mockExistingPosition);

      await expect(
        portfolioService.updatePosition(mockPositionId, { purchasePrice: -10 })
      ).rejects.toThrow('Purchase price must be greater than 0');
    });
  });

  describe('deletePosition', () => {
    const mockPositionId = 'position-123';
    const mockExistingPosition: StockPosition = {
      id: mockPositionId,
      userId: 'user-123',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      quantity: 10,
      purchasePrice: 150.00,
      purchaseDate: new Date('2024-01-15'),
      currentPrice: 160.00,
      sector: 'Technology',
      marketCap: 'Large Cap',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should successfully delete position', async () => {
      mockPrisma.stockPosition.findUnique.mockResolvedValue(mockExistingPosition);
      mockPrisma.stockPosition.delete.mockResolvedValue(mockExistingPosition);

      await portfolioService.deletePosition(mockPositionId);

      expect(mockPrisma.stockPosition.findUnique).toHaveBeenCalledWith({
        where: { id: mockPositionId }
      });
      expect(mockPrisma.stockPosition.delete).toHaveBeenCalledWith({
        where: { id: mockPositionId }
      });
    });

    it('should throw error if position not found', async () => {
      mockPrisma.stockPosition.findUnique.mockResolvedValue(null);

      await expect(
        portfolioService.deletePosition(mockPositionId)
      ).rejects.toThrow(`Stock position with ID ${mockPositionId} not found`);

      expect(mockPrisma.stockPosition.delete).not.toHaveBeenCalled();
    });
  });

  describe('getPortfolio', () => {
    const mockUserId = 'user-123';
    const mockPositions: StockPosition[] = [
      {
        id: 'position-1',
        userId: mockUserId,
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        quantity: 10,
        purchasePrice: 150.00,
        purchaseDate: new Date('2024-01-15'),
        currentPrice: 160.00,
        sector: 'Technology',
        marketCap: 'Large Cap',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'position-2',
        userId: mockUserId,
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc.',
        quantity: 5,
        purchasePrice: 2500.00,
        purchaseDate: new Date('2024-01-20'),
        currentPrice: 2600.00,
        sector: 'Technology',
        marketCap: 'Large Cap',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return portfolio with calculations', async () => {
      mockPrisma.stockPosition.findMany.mockResolvedValue(mockPositions);
      mockMarketDataService.getBatchPrices.mockResolvedValue([
        { symbol: 'AAPL', price: 165.00, change: 5.00, changePercent: 3.13, lastUpdated: new Date() },
        { symbol: 'GOOGL', price: 2650.00, change: 50.00, changePercent: 1.92, lastUpdated: new Date() },
      ]);

      const result = await portfolioService.getPortfolio(mockUserId);

      expect(mockPrisma.stockPosition.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { createdAt: 'desc' }
      });

      expect(result.userId).toBe(mockUserId);
      expect(result.positions).toHaveLength(2);
      expect(result.totalCost).toBe(10 * 150 + 5 * 2500); // 1500 + 12500 = 14000
      expect(result.totalValue).toBe(10 * 165 + 5 * 2650); // 1650 + 13250 = 14900
      expect(result.unrealizedGainLoss).toBe(900); // 14900 - 14000
      expect(result.unrealizedGainLossPercent).toBeCloseTo(6.43, 2); // (900/14000) * 100
    });

    it('should return empty portfolio for user with no positions', async () => {
      mockPrisma.stockPosition.findMany.mockResolvedValue([]);

      const result = await portfolioService.getPortfolio(mockUserId);

      expect(result).toEqual({
        userId: mockUserId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: expect.any(Date),
      });
    });

    it('should handle price update failures gracefully', async () => {
      mockPrisma.stockPosition.findMany.mockResolvedValue(mockPositions);
      mockMarketDataService.getBatchPrices.mockRejectedValue(new Error('API Error'));

      const result = await portfolioService.getPortfolio(mockUserId);

      expect(result.positions).toEqual(mockPositions);
      expect(result.totalValue).toBe(10 * 160 + 5 * 2600); // Using existing currentPrice
    });
  });

  describe('calculatePortfolioMetrics', () => {
    const mockUserId = 'user-123';

    it('should return empty metrics for empty portfolio', async () => {
      mockPrisma.stockPosition.findMany.mockResolvedValue([]);

      const result = await portfolioService.calculatePortfolioMetrics(mockUserId);

      expect(result).toEqual({
        totalValue: 0,
        dailyChange: 0,
        dailyChangePercent: 0,
        totalReturn: 0,
        totalReturnPercent: 0,
        sectorAllocation: [],
        marketCapDistribution: {
          largeCap: { value: 0, percentage: 0, count: 0 },
          midCap: { value: 0, percentage: 0, count: 0 },
          smallCap: { value: 0, percentage: 0, count: 0 },
        },
        topPerformers: [],
        topLosers: [],
      });
    });

    it('should calculate comprehensive metrics for portfolio with positions', async () => {
      const mockPositions: StockPosition[] = [
        {
          id: 'position-1',
          userId: mockUserId,
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          purchasePrice: 150.00,
          purchaseDate: new Date('2024-01-15'),
          currentPrice: 165.00,
          sector: 'Technology',
          marketCap: 'Large Cap',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'position-2',
          userId: mockUserId,
          symbol: 'JPM',
          companyName: 'JPMorgan Chase',
          quantity: 8,
          purchasePrice: 140.00,
          purchaseDate: new Date('2024-01-20'),
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
        { symbol: 'JPM', price: 135.00, change: -2.00, changePercent: -1.46, lastUpdated: new Date() },
      ]);

      const result = await portfolioService.calculatePortfolioMetrics(mockUserId);

      // Total value: (10 * 165) + (8 * 135) = 1650 + 1080 = 2730
      // Total cost: (10 * 150) + (8 * 140) = 1500 + 1120 = 2620
      // Unrealized gain: 2730 - 2620 = 110

      expect(result.totalValue).toBe(2730);
      expect(result.totalReturn).toBe(110);
      expect(result.totalReturnPercent).toBeCloseTo(4.20, 2);

      // Check sector allocation
      expect(result.sectorAllocation).toHaveLength(2);
      expect(result.sectorAllocation[0]).toEqual({
        sector: 'Technology',
        value: 1650,
        percentage: (1650 / 2730) * 100,
        positions: 1,
      });

      // Check market cap distribution
      expect(result.marketCapDistribution.largeCap.count).toBe(2);
      expect(result.marketCapDistribution.largeCap.value).toBe(2730);

      // Check top performers and losers
      expect(result.topPerformers[0].symbol).toBe('AAPL'); // 10% gain
      expect(result.topLosers[0].symbol).toBe('JPM'); // -3.57% loss
    });
  });
});