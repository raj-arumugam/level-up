import nodemailer from 'nodemailer';
import { prisma } from '../lib/database';
import { portfolioService } from './portfolioService';
import { analyticsService } from './analyticsService';
import { marketDataService } from './marketDataService';
import {
  User,
  StockPosition,
  NotificationSettings,
  Portfolio,
  SectorPerformance,
  UpdateNotificationSettingsDto
} from '../types';

export interface NotificationServiceInterface {
  sendDailyUpdate(userId: string, report: DailyReportData): Promise<void>;
  generateDailyReport(userId: string): Promise<DailyReportData>;
  detectSignificantMovers(positions: StockPosition[], threshold?: number): Promise<StockPosition[]>;
  updateNotificationSettings(userId: string, settings: UpdateNotificationSettingsDto): Promise<NotificationSettings>;
  getNotificationSettings(userId: string): Promise<NotificationSettings>;
  sendTestEmail(userId: string): Promise<void>;
}

export interface DailyReportData {
  userId: string;
  reportDate: Date;
  portfolioValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  significantMovers: StockPosition[];
  sectorPerformance: SectorPerformance[];
  marketSummary: string;
}

export interface SignificantMover extends StockPosition {
  priceChange: number;
  priceChangePercent: number;
  isPositive: boolean;
}

export class NotificationService implements NotificationServiceInterface {
  private transporter: nodemailer.Transporter | null = null;
  private readonly retryAttempts: number;
  private readonly defaultThreshold: number = 5.0; // 5% threshold for significant moves

  constructor() {
    this.retryAttempts = parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS || '3');
    this.initializeEmailTransporter();
  }

  /**
   * Initialize email transporter with configuration
   */
  private initializeEmailTransporter(): void {
    const emailConfig = {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    };

    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      console.warn('Email credentials not configured. Email notifications will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport(emailConfig);

    // Verify connection configuration
    this.transporter.verify((error) => {
      if (error) {
        console.error('Email transporter verification failed:', error);
      } else {
        console.log('Email transporter is ready to send messages');
      }
    });
  }

  /**
   * Generate comprehensive daily report for a user
   */
  async generateDailyReport(userId: string): Promise<DailyReportData> {
    try {
      // Get user's portfolio
      const portfolio = await portfolioService.getPortfolio(userId);
      
      if (portfolio.positions.length === 0) {
        return {
          userId,
          reportDate: new Date(),
          portfolioValue: 0,
          dailyChange: 0,
          dailyChangePercent: 0,
          significantMovers: [],
          sectorPerformance: [],
          marketSummary: 'No positions in portfolio'
        };
      }

      // Get user's notification settings for threshold
      const settings = await this.getNotificationSettings(userId);
      
      // Calculate daily changes (simplified - in production you'd compare with previous day's data)
      const dailyChange = await this.calculateDailyChange(portfolio);
      const dailyChangePercent = portfolio.totalValue > 0 ? (dailyChange / portfolio.totalValue) * 100 : 0;

      // Detect significant price movements
      const significantMovers = await this.detectSignificantMovers(
        portfolio.positions, 
        settings.alertThreshold
      );

      // Generate sector performance analysis
      const sectorPerformance = await this.calculateSectorPerformance(portfolio);

      // Generate market summary
      const marketSummary = await this.generateMarketSummary(portfolio, significantMovers);

      const reportData: DailyReportData = {
        userId,
        reportDate: new Date(),
        portfolioValue: portfolio.totalValue,
        dailyChange,
        dailyChangePercent,
        significantMovers,
        sectorPerformance,
        marketSummary
      };

      // Save report to database
      await this.saveDailyReport(reportData);

      return reportData;
    } catch (error) {
      console.error(`Failed to generate daily report for user ${userId}:`, error);
      throw new Error(`Unable to generate daily report: ${error}`);
    }
  }

  /**
   * Send daily update email to user
   */
  async sendDailyUpdate(userId: string, report: DailyReportData): Promise<void> {
    if (!this.transporter) {
      console.warn('Email transporter not configured. Skipping email send.');
      return;
    }

    try {
      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { notificationSettings: true }
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (!user.notificationSettings?.emailEnabled || !user.notificationSettings?.dailyUpdateEnabled) {
        console.log(`Daily update email disabled for user ${userId}`);
        return;
      }

      // Generate email content
      const emailContent = await this.generateEmailContent(user, report);

      // Send email with retry logic
      await this.sendEmailWithRetry({
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });

      // Update report as sent
      await this.markReportAsSent(userId, report.reportDate);

      console.log(`Daily update email sent successfully to ${user.email}`);
    } catch (error) {
      console.error(`Failed to send daily update to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Detect stocks with significant price movements
   */
  async detectSignificantMovers(positions: StockPosition[], threshold: number = this.defaultThreshold): Promise<StockPosition[]> {
    const significantMovers: StockPosition[] = [];

    for (const position of positions) {
      try {
        // Get current price
        const currentPrice = await marketDataService.getCurrentPrice(position.symbol);
        
        // Calculate price change from purchase price (simplified)
        // In production, you'd compare with previous day's closing price
        const priceChange = currentPrice.price - position.purchasePrice;
        const priceChangePercent = (priceChange / position.purchasePrice) * 100;

        // Check if movement exceeds threshold
        if (Math.abs(priceChangePercent) >= threshold) {
          // Add additional properties for significant mover
          const significantMover = {
            ...position,
            currentPrice: currentPrice.price,
            priceChange,
            priceChangePercent,
            isPositive: priceChangePercent > 0
          } as StockPosition & { priceChange: number; priceChangePercent: number; isPositive: boolean };

          significantMovers.push(significantMover);
        }
      } catch (error) {
        console.warn(`Failed to check price movement for ${position.symbol}:`, error);
        // Continue with other positions
      }
    }

    // Sort by absolute percentage change (highest first)
    return significantMovers.sort((a, b) => {
      const aChange = Math.abs((a as any).priceChangePercent);
      const bChange = Math.abs((b as any).priceChangePercent);
      return bChange - aChange;
    });
  }

  /**
   * Update user notification settings
   */
  async updateNotificationSettings(userId: string, settings: UpdateNotificationSettingsDto): Promise<NotificationSettings> {
    try {
      // Validate settings
      if (settings.alertThreshold !== undefined && (settings.alertThreshold < 0 || settings.alertThreshold > 100)) {
        throw new Error('Alert threshold must be between 0 and 100');
      }

      if (settings.updateTime && !this.isValidTimeFormat(settings.updateTime)) {
        throw new Error('Update time must be in HH:MM format');
      }

      // Update or create notification settings
      const updatedSettings = await prisma.notificationSettings.upsert({
        where: { userId },
        update: {
          ...(settings.emailEnabled !== undefined && { emailEnabled: settings.emailEnabled }),
          ...(settings.dailyUpdateEnabled !== undefined && { dailyUpdateEnabled: settings.dailyUpdateEnabled }),
          ...(settings.updateTime !== undefined && { updateTime: settings.updateTime }),
          ...(settings.alertThreshold !== undefined && { alertThreshold: settings.alertThreshold }),
          ...(settings.weekendsEnabled !== undefined && { weekendsEnabled: settings.weekendsEnabled }),
          updatedAt: new Date()
        },
        create: {
          userId,
          emailEnabled: settings.emailEnabled ?? true,
          dailyUpdateEnabled: settings.dailyUpdateEnabled ?? true,
          updateTime: settings.updateTime ?? '09:00',
          alertThreshold: settings.alertThreshold ?? this.defaultThreshold,
          weekendsEnabled: settings.weekendsEnabled ?? false
        }
      });

      return updatedSettings;
    } catch (error) {
      console.error(`Failed to update notification settings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user notification settings
   */
  async getNotificationSettings(userId: string): Promise<NotificationSettings> {
    try {
      let settings = await prisma.notificationSettings.findUnique({
        where: { userId }
      });

      // Create default settings if none exist
      if (!settings) {
        settings = await prisma.notificationSettings.create({
          data: {
            userId,
            emailEnabled: true,
            dailyUpdateEnabled: true,
            updateTime: '09:00',
            alertThreshold: this.defaultThreshold,
            weekendsEnabled: false
          }
        });
      }

      return settings;
    } catch (error) {
      console.error(`Failed to get notification settings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail(userId: string): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      await this.sendEmailWithRetry({
        to: user.email,
        subject: 'Portfolio Tracker - Test Email',
        html: `
          <h2>Test Email Successful</h2>
          <p>Hello ${user.firstName},</p>
          <p>This is a test email to verify your notification settings are working correctly.</p>
          <p>If you received this email, your daily update notifications are properly configured.</p>
          <br>
          <p>Best regards,<br>Portfolio Tracker Team</p>
        `,
        text: `Test Email Successful\n\nHello ${user.firstName},\n\nThis is a test email to verify your notification settings are working correctly.\n\nIf you received this email, your daily update notifications are properly configured.\n\nBest regards,\nPortfolio Tracker Team`
      });

      console.log(`Test email sent successfully to ${user.email}`);
    } catch (error) {
      console.error(`Failed to send test email to user ${userId}:`, error);
      throw error;
    }
  }  /**
 
  * Calculate daily change for portfolio (simplified implementation)
   */
  private async calculateDailyChange(portfolio: Portfolio): Promise<number> {
    // In a real implementation, you would:
    // 1. Get previous day's portfolio value from database
    // 2. Compare with current value
    // For now, we'll use a simplified calculation based on current vs purchase prices
    
    let totalCurrentValue = 0;
    let totalPreviousValue = 0;

    for (const position of portfolio.positions) {
      try {
        const currentPrice = await marketDataService.getCurrentPrice(position.symbol);
        const currentPositionValue = position.quantity * currentPrice.price;
        
        // Use purchase price as "previous" value for simplification
        const previousPositionValue = position.quantity * position.purchasePrice;
        
        totalCurrentValue += currentPositionValue;
        totalPreviousValue += previousPositionValue;
      } catch (error) {
        console.warn(`Failed to calculate daily change for ${position.symbol}:`, error);
        // Use stored current price or purchase price as fallback
        const fallbackPrice = position.currentPrice || position.purchasePrice;
        totalCurrentValue += position.quantity * fallbackPrice;
        totalPreviousValue += position.quantity * position.purchasePrice;
      }
    }

    return totalCurrentValue - totalPreviousValue;
  }

  /**
   * Calculate sector performance for daily report
   */
  private async calculateSectorPerformance(portfolio: Portfolio): Promise<SectorPerformance[]> {
    try {
      const performanceReport = await analyticsService.generatePerformanceReport(portfolio.userId);
      return performanceReport.sectorPerformance;
    } catch (error) {
      console.warn('Failed to calculate sector performance:', error);
      return [];
    }
  }

  /**
   * Generate market summary text
   */
  private async generateMarketSummary(portfolio: Portfolio, significantMovers: StockPosition[]): Promise<string> {
    const totalPositions = portfolio.positions.length;
    const significantCount = significantMovers.length;
    
    let summary = `Portfolio contains ${totalPositions} position${totalPositions !== 1 ? 's' : ''} `;
    summary += `with a total value of $${portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
    
    if (significantCount > 0) {
      summary += ` ${significantCount} position${significantCount !== 1 ? 's' : ''} had significant price movements today.`;
    } else {
      summary += ' No significant price movements detected today.';
    }

    // Add overall portfolio performance
    if (portfolio.unrealizedGainLoss !== 0) {
      const gainLossText = portfolio.unrealizedGainLoss > 0 ? 'gain' : 'loss';
      summary += ` Overall portfolio shows an unrealized ${gainLossText} of $${Math.abs(portfolio.unrealizedGainLoss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `;
      summary += `(${portfolio.unrealizedGainLossPercent.toFixed(2)}%).`;
    }

    return summary;
  }

  /**
   * Save daily report to database
   */
  private async saveDailyReport(reportData: DailyReportData): Promise<void> {
    try {
      await prisma.dailyReport.upsert({
        where: {
          userId_reportDate: {
            userId: reportData.userId,
            reportDate: new Date(reportData.reportDate.toDateString()) // Normalize to date only
          }
        },
        update: {
          portfolioValue: reportData.portfolioValue,
          dailyChange: reportData.dailyChange,
          dailyChangePercent: reportData.dailyChangePercent,
          significantMovers: JSON.stringify(reportData.significantMovers),
          sectorPerformance: JSON.stringify(reportData.sectorPerformance),
          marketSummary: reportData.marketSummary
        },
        create: {
          userId: reportData.userId,
          reportDate: new Date(reportData.reportDate.toDateString()),
          portfolioValue: reportData.portfolioValue,
          dailyChange: reportData.dailyChange,
          dailyChangePercent: reportData.dailyChangePercent,
          significantMovers: JSON.stringify(reportData.significantMovers),
          sectorPerformance: JSON.stringify(reportData.sectorPerformance),
          marketSummary: reportData.marketSummary,
          emailSent: false
        }
      });
    } catch (error) {
      console.error('Failed to save daily report:', error);
      throw error;
    }
  }

  /**
   * Generate email content for daily update
   */
  private async generateEmailContent(user: User, report: DailyReportData): Promise<{
    subject: string;
    html: string;
    text: string;
  }> {
    const date = report.reportDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const changeColor = report.dailyChangePercent >= 0 ? '#4CAF50' : '#F44336';
    const changeSymbol = report.dailyChangePercent >= 0 ? '+' : '';

    const subject = `Daily Portfolio Update - ${date}`;

    // Generate HTML email
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .metric { background-color: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #2196F3; }
          .metric-value { font-size: 24px; font-weight: bold; margin: 5px 0; }
          .positive { color: #4CAF50; }
          .negative { color: #F44336; }
          .movers { margin: 20px 0; }
          .mover { background-color: white; padding: 10px; margin: 5px 0; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Daily Portfolio Update</h1>
          <p>${date}</p>
        </div>
        
        <div class="content">
          <div class="metric">
            <h3>Portfolio Value</h3>
            <div class="metric-value">$${report.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          
          <div class="metric">
            <h3>Daily Change</h3>
            <div class="metric-value" style="color: ${changeColor}">
              ${changeSymbol}$${Math.abs(report.dailyChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
              (${changeSymbol}${report.dailyChangePercent.toFixed(2)}%)
            </div>
          </div>

          ${report.significantMovers.length > 0 ? `
          <div class="movers">
            <h3>Significant Movers (>${await this.getAlertThreshold(report.userId)}% change)</h3>
            ${report.significantMovers.slice(0, 5).map((mover: any) => `
              <div class="mover">
                <div>
                  <strong>${mover.symbol}</strong> - ${mover.companyName}
                  <br><small>${mover.quantity} shares</small>
                </div>
                <div style="color: ${mover.isPositive ? '#4CAF50' : '#F44336'}; font-weight: bold;">
                  ${mover.isPositive ? '+' : ''}${mover.priceChangePercent.toFixed(2)}%
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${report.sectorPerformance.length > 0 ? `
          <div>
            <h3>Sector Performance</h3>
            <table>
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Return</th>
                  <th>Contribution</th>
                </tr>
              </thead>
              <tbody>
                ${report.sectorPerformance.slice(0, 5).map(sector => `
                  <tr>
                    <td>${sector.sector}</td>
                    <td style="color: ${sector.returnPercent >= 0 ? '#4CAF50' : '#F44336'}">
                      ${sector.returnPercent >= 0 ? '+' : ''}${sector.returnPercent.toFixed(2)}%
                    </td>
                    <td>${sector.contribution.toFixed(2)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}

          <div class="metric">
            <h3>Market Summary</h3>
            <p>${report.marketSummary}</p>
          </div>
        </div>

        <div class="footer">
          <p>This is an automated daily update from Portfolio Tracker.</p>
          <p>To modify your notification settings, please log in to your account.</p>
        </div>
      </body>
      </html>
    `;

    // Generate plain text email
    const text = `
Daily Portfolio Update - ${date}

Hello ${user.firstName},

Here's your daily portfolio update:

Portfolio Value: $${report.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Daily Change: ${changeSymbol}$${Math.abs(report.dailyChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${changeSymbol}${report.dailyChangePercent.toFixed(2)}%)

${report.significantMovers.length > 0 ? `
Significant Movers:
${report.significantMovers.slice(0, 5).map((mover: any) => 
  `- ${mover.symbol}: ${mover.isPositive ? '+' : ''}${mover.priceChangePercent.toFixed(2)}%`
).join('\n')}
` : 'No significant movers today.'}

${report.sectorPerformance.length > 0 ? `
Top Sector Performance:
${report.sectorPerformance.slice(0, 3).map(sector => 
  `- ${sector.sector}: ${sector.returnPercent >= 0 ? '+' : ''}${sector.returnPercent.toFixed(2)}%`
).join('\n')}
` : ''}

Market Summary:
${report.marketSummary}

---
This is an automated daily update from Portfolio Tracker.
To modify your notification settings, please log in to your account.
    `.trim();

    return { subject, html, text };
  }

  /**
   * Send email with retry logic
   */
  private async sendEmailWithRetry(mailOptions: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    const fromAddress = process.env.EMAIL_FROM || 'Portfolio Tracker <noreply@portfoliotracker.com>';
    
    const options = {
      from: fromAddress,
      ...mailOptions
    };

    let lastError: any;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await this.transporter.sendMail(options);
        return; // Success
      } catch (error) {
        lastError = error;
        console.warn(`Email send attempt ${attempt} failed:`, error);
        
        if (attempt < this.retryAttempts) {
          // Wait before retrying (exponential backoff)
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to send email after ${this.retryAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Mark daily report as sent
   */
  private async markReportAsSent(userId: string, reportDate: Date): Promise<void> {
    try {
      await prisma.dailyReport.update({
        where: {
          userId_reportDate: {
            userId,
            reportDate: new Date(reportDate.toDateString())
          }
        },
        data: {
          emailSent: true,
          emailSentAt: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to mark report as sent:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get user's alert threshold
   */
  private async getAlertThreshold(userId: string): Promise<number> {
    try {
      const settings = await this.getNotificationSettings(userId);
      return settings.alertThreshold;
    } catch (error) {
      return this.defaultThreshold;
    }
  }

  /**
   * Validate time format (HH:MM)
   */
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }
}

export const notificationService = new NotificationService();