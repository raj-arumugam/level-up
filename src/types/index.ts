import { User, StockPosition, NotificationSettings, DailyReport, MarketData } from '@prisma/client';

// Re-export Prisma types
export { User, StockPosition, NotificationSettings, DailyReport, MarketData };

// Extended types with relations
export interface UserWithRelations extends User {
  stockPositions?: StockPosition[];
  notificationSettings?: NotificationSettings;
  dailyReports?: DailyReport[];
}

export interface Portfolio {
  userId: string;
  positions: StockPosition[];
  totalValue: number;
  totalCost: number;
  unrealizedGainLoss: number;
  unrealizedGainLossPercent: number;
  lastUpdated: Date;
}

export interface PortfolioMetrics {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  sectorAllocation: SectorAllocation[];
  marketCapDistribution: MarketCapDistribution;
  topPerformers: StockPosition[];
  topLosers: StockPosition[];
}

export interface SectorAllocation {
  sector: string;
  value: number;
  percentage: number;
  positions: number;
}

export interface MarketCapDistribution {
  largeCap: { value: number; percentage: number; count: number };
  midCap: { value: number; percentage: number; count: number };
  smallCap: { value: number; percentage: number; count: number };
}

export interface StockPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  lastUpdated: Date;
}

export interface HistoricalPrice {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BenchmarkComparison {
  portfolioReturn: number;
  benchmarkReturn: number;
  outperformance: number;
  correlation: number;
  beta: number;
}

export interface PerformanceReport {
  period: string;
  startValue: number;
  endValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  benchmarkComparison?: BenchmarkComparison;
  sectorPerformance: SectorPerformance[];
}

export interface SectorPerformance {
  sector: string;
  return: number;
  returnPercent: number;
  contribution: number;
}

// DTOs for API requests
export interface CreatePositionDto {
  symbol: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: Date;
}

export interface UpdatePositionDto {
  quantity?: number;
  purchasePrice?: number;
  purchaseDate?: Date;
}

export interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdateNotificationSettingsDto {
  emailEnabled?: boolean;
  dailyUpdateEnabled?: boolean;
  updateTime?: string;
  alertThreshold?: number;
  weekendsEnabled?: boolean;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  token: string;
  expiresIn: string;
}