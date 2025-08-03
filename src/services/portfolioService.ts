import { prisma } from '../lib/database';
import { marketDataService } from './marketDataService';
import {
  StockPosition,
  Portfolio,
  PortfolioMetrics,
  CreatePositionDto,
  UpdatePositionDto,
  SectorAllocation,
  MarketCapDistribution
} from '../types';

export interface PortfolioServiceInterface {
  addPosition(userId: string, position: CreatePositionDto): Promise<StockPosition>;
  updatePosition(positionId: string, updates: UpdatePositionDto): Promise<StockPosition>;
  deletePosition(positionId: string): Promise<void>;
  getPortfolio(userId: string): Promise<Portfolio>;
  calculatePortfolioMetrics(userId: string): Promise<PortfolioMetrics>;
}

export class PortfolioService implements PortfolioServiceInterface {
  /**
   * Add a new stock position to user's portfolio
   */
  async addPosition(userId: string, position: CreatePositionDto): Promise<StockPosition> {
    // Validate input data
    this.validatePositionData(position);
    
    // Validate stock symbol
    const isValidSymbol = await marketDataService.validateSymbol(position.symbol);
    if (!isValidSymbol) {
      throw new Error(`Invalid stock symbol: ${position.symbol}`);
    }

    // Get current market data for the stock
    let currentPrice: number | undefined;
    let companyName = position.symbol;
    let sector: string | undefined;
    let marketCap: string | undefined;

    try {
      const stockPrice = await marketDataService.getCurrentPrice(position.symbol);
      currentPrice = stockPrice.price;
      
      // Try to get additional company info from market data table
      const marketData = await prisma.marketData.findUnique({
        where: { symbol: position.symbol.toUpperCase() }
      });
      
      if (marketData) {
        companyName = marketData.companyName;
        sector = marketData.sector || undefined;
        marketCap = marketData.marketCap || undefined;
      }
    } catch (error) {
      console.warn(`Could not fetch current price for ${position.symbol}:`, error);
      // Continue without current price - it's not required for position creation
    }

    // Create the position
    const newPosition = await prisma.stockPosition.create({
      data: {
        userId,
        symbol: position.symbol.toUpperCase(),
        companyName,
        quantity: position.quantity,
        purchasePrice: position.purchasePrice,
        purchaseDate: position.purchaseDate,
        currentPrice,
        sector,
        marketCap
      }
    });

    return newPosition;
  }

  /**
   * Update an existing stock position
   */
  async updatePosition(positionId: string, updates: UpdatePositionDto): Promise<StockPosition> {
    // Validate that position exists
    const existingPosition = await prisma.stockPosition.findUnique({
      where: { id: positionId }
    });

    if (!existingPosition) {
      throw new Error(`Stock position with ID ${positionId} not found`);
    }

    // Validate update data
    if (updates.quantity !== undefined && updates.quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }
    
    if (updates.purchasePrice !== undefined && updates.purchasePrice <= 0) {
      throw new Error('Purchase price must be greater than 0');
    }

    if (updates.purchaseDate !== undefined && updates.purchaseDate > new Date()) {
      throw new Error('Purchase date cannot be in the future');
    }

    // Update the position
    const updatedPosition = await prisma.stockPosition.update({
      where: { id: positionId },
      data: {
        ...(updates.quantity !== undefined && { quantity: updates.quantity }),
        ...(updates.purchasePrice !== undefined && { purchasePrice: updates.purchasePrice }),
        ...(updates.purchaseDate !== undefined && { purchaseDate: updates.purchaseDate }),
        updatedAt: new Date()
      }
    });

    return updatedPosition;
  }

  /**
   * Delete a stock position
   */
  async deletePosition(positionId: string): Promise<void> {
    // Validate that position exists
    const existingPosition = await prisma.stockPosition.findUnique({
      where: { id: positionId }
    });

    if (!existingPosition) {
      throw new Error(`Stock position with ID ${positionId} not found`);
    }

    // Delete the position
    await prisma.stockPosition.delete({
      where: { id: positionId }
    });
  }

  /**
   * Get user's complete portfolio with current values
   */
  async getPortfolio(userId: string): Promise<Portfolio> {
    // Get all positions for the user
    const positions = await prisma.stockPosition.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    if (positions.length === 0) {
      return {
        userId,
        positions: [],
        totalValue: 0,
        totalCost: 0,
        unrealizedGainLoss: 0,
        unrealizedGainLossPercent: 0,
        lastUpdated: new Date()
      };
    }

    // Update current prices for all positions
    const updatedPositions = await this.updatePositionPrices(positions);

    // Calculate portfolio totals
    const totalCost = updatedPositions.reduce((sum, pos) => 
      sum + (pos.quantity * pos.purchasePrice), 0
    );

    const totalValue = updatedPositions.reduce((sum, pos) => 
      sum + (pos.quantity * (pos.currentPrice || pos.purchasePrice)), 0
    );

    const unrealizedGainLoss = totalValue - totalCost;
    const unrealizedGainLossPercent = totalCost > 0 ? (unrealizedGainLoss / totalCost) * 100 : 0;

    return {
      userId,
      positions: updatedPositions,
      totalValue,
      totalCost,
      unrealizedGainLoss,
      unrealizedGainLossPercent,
      lastUpdated: new Date()
    };
  }

  /**
   * Calculate comprehensive portfolio metrics
   */
  async calculatePortfolioMetrics(userId: string): Promise<PortfolioMetrics> {
    const portfolio = await this.getPortfolio(userId);
    
    if (portfolio.positions.length === 0) {
      return {
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
    }

    // Calculate daily change (this would require previous day's data in a real implementation)
    // For now, we'll use a placeholder calculation
    const dailyChange = 0; // TODO: Implement with historical data
    const dailyChangePercent = portfolio.totalValue > 0 ? (dailyChange / portfolio.totalValue) * 100 : 0;

    // Calculate sector allocation
    const sectorAllocation = this.calculateSectorAllocation(portfolio.positions, portfolio.totalValue);

    // Calculate market cap distribution
    const marketCapDistribution = this.calculateMarketCapDistribution(portfolio.positions, portfolio.totalValue);

    // Find top performers and losers
    const positionsWithReturns = portfolio.positions
      .map(pos => ({
        ...pos,
        returnPercent: pos.currentPrice 
          ? ((pos.currentPrice - pos.purchasePrice) / pos.purchasePrice) * 100 
          : 0
      }))
      .sort((a, b) => b.returnPercent - a.returnPercent);

    const topPerformers = positionsWithReturns.slice(0, 5);
    const topLosers = positionsWithReturns.slice(-5).reverse();

    return {
      totalValue: portfolio.totalValue,
      dailyChange,
      dailyChangePercent,
      totalReturn: portfolio.unrealizedGainLoss,
      totalReturnPercent: portfolio.unrealizedGainLossPercent,
      sectorAllocation,
      marketCapDistribution,
      topPerformers,
      topLosers
    };
  }

  /**
   * Update current prices for all positions
   */
  private async updatePositionPrices(positions: StockPosition[]): Promise<StockPosition[]> {
    const symbols = [...new Set(positions.map(pos => pos.symbol))];
    
    try {
      const currentPrices = await marketDataService.getBatchPrices(symbols);
      const priceMap = new Map(currentPrices.map(price => [price.symbol, price.price]));

      // Update positions with current prices
      const updatedPositions = positions.map(position => ({
        ...position,
        currentPrice: priceMap.get(position.symbol) || position.currentPrice
      }));

      // Update database with new prices (batch update)
      const updatePromises = updatedPositions
        .filter(pos => pos.currentPrice && pos.currentPrice !== positions.find(p => p.id === pos.id)?.currentPrice)
        .map(pos => 
          prisma.stockPosition.update({
            where: { id: pos.id },
            data: { currentPrice: pos.currentPrice }
          })
        );

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      return updatedPositions;
    } catch (error) {
      console.warn('Failed to update position prices:', error);
      return positions; // Return original positions if price update fails
    }
  }

  /**
   * Calculate sector allocation for portfolio
   */
  private calculateSectorAllocation(positions: StockPosition[], totalValue: number): SectorAllocation[] {
    if (totalValue === 0) return [];

    const sectorMap = new Map<string, { value: number; positions: number }>();

    positions.forEach(position => {
      const sector = position.sector || 'Unknown';
      const positionValue = position.quantity * (position.currentPrice || position.purchasePrice);
      
      const existing = sectorMap.get(sector) || { value: 0, positions: 0 };
      sectorMap.set(sector, {
        value: existing.value + positionValue,
        positions: existing.positions + 1
      });
    });

    return Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        value: data.value,
        percentage: (data.value / totalValue) * 100,
        positions: data.positions
      }))
      .sort((a, b) => b.value - a.value);
  }

  /**
   * Calculate market cap distribution
   */
  private calculateMarketCapDistribution(positions: StockPosition[], totalValue: number): MarketCapDistribution {
    if (totalValue === 0) {
      return {
        largeCap: { value: 0, percentage: 0, count: 0 },
        midCap: { value: 0, percentage: 0, count: 0 },
        smallCap: { value: 0, percentage: 0, count: 0 }
      };
    }

    const distribution = {
      largeCap: { value: 0, percentage: 0, count: 0 },
      midCap: { value: 0, percentage: 0, count: 0 },
      smallCap: { value: 0, percentage: 0, count: 0 }
    };

    positions.forEach(position => {
      const positionValue = position.quantity * (position.currentPrice || position.purchasePrice);
      const marketCap = position.marketCap || 'Unknown';
      
      if (marketCap.includes('Large') || marketCap.includes('Mega')) {
        distribution.largeCap.value += positionValue;
        distribution.largeCap.count += 1;
      } else if (marketCap.includes('Mid')) {
        distribution.midCap.value += positionValue;
        distribution.midCap.count += 1;
      } else if (marketCap.includes('Small') || marketCap.includes('Micro')) {
        distribution.smallCap.value += positionValue;
        distribution.smallCap.count += 1;
      } else {
        // Default unknown to large cap
        distribution.largeCap.value += positionValue;
        distribution.largeCap.count += 1;
      }
    });

    // Calculate percentages
    distribution.largeCap.percentage = (distribution.largeCap.value / totalValue) * 100;
    distribution.midCap.percentage = (distribution.midCap.value / totalValue) * 100;
    distribution.smallCap.percentage = (distribution.smallCap.value / totalValue) * 100;

    return distribution;
  }

  /**
   * Validate position data
   */
  private validatePositionData(position: CreatePositionDto): void {
    if (!position.symbol || position.symbol.trim().length === 0) {
      throw new Error('Stock symbol is required');
    }

    if (position.quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    if (position.purchasePrice <= 0) {
      throw new Error('Purchase price must be greater than 0');
    }

    if (position.purchaseDate > new Date()) {
      throw new Error('Purchase date cannot be in the future');
    }

    // Additional validation for reasonable values
    if (position.quantity > 1000000) {
      throw new Error('Quantity seems unreasonably high');
    }

    if (position.purchasePrice > 100000) {
      throw new Error('Purchase price seems unreasonably high');
    }
  }
}

export const portfolioService = new PortfolioService();