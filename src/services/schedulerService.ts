import cron from 'node-cron';
import { prisma } from '../lib/database';
import { notificationService } from './notificationService';
import { User } from '../types';

export interface SchedulerServiceInterface {
  startDailyUpdateScheduler(): void;
  stopDailyUpdateScheduler(): void;
  processDailyUpdatesForAllUsers(): Promise<void>;
  processDailyUpdateForUser(userId: string): Promise<void>;
  isSchedulerRunning(): boolean;
}

export interface SchedulerStats {
  totalUsers: number;
  successfulUpdates: number;
  failedUpdates: number;
  skippedUpdates: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  errors: Array<{
    userId: string;
    error: string;
    timestamp: Date;
  }>;
}

export class SchedulerService implements SchedulerServiceInterface {
  private dailyUpdateTask: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private readonly cronExpression: string;
  private readonly retryAttempts: number;
  private readonly batchSize: number;
  private readonly batchDelay: number; // Delay between batches in milliseconds

  constructor() {
    // Default to 9 AM daily, can be overridden by environment variable
    this.cronExpression = process.env.DAILY_UPDATE_CRON || '0 9 * * *';
    this.retryAttempts = parseInt(process.env.SCHEDULER_RETRY_ATTEMPTS || '3');
    this.batchSize = parseInt(process.env.SCHEDULER_BATCH_SIZE || '10');
    this.batchDelay = parseInt(process.env.SCHEDULER_BATCH_DELAY || '5000'); // 5 seconds
  }

  /**
   * Start the daily update scheduler
   */
  startDailyUpdateScheduler(): void {
    if (this.dailyUpdateTask) {
      console.log('Daily update scheduler is already running');
      return;
    }

    // Validate cron expression
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`Invalid cron expression: ${this.cronExpression}`);
    }

    console.log(`Starting daily update scheduler with cron expression: ${this.cronExpression}`);

    this.dailyUpdateTask = cron.schedule(
      this.cronExpression,
      async () => {
        if (this.isRunning) {
          console.log('Daily update process is already running, skipping this execution');
          return;
        }

        console.log('Starting scheduled daily update process');
        await this.processDailyUpdatesForAllUsers();
      },
      {
        scheduled: true,
        timezone: process.env.SCHEDULER_TIMEZONE || 'America/New_York'
      }
    );

    console.log('Daily update scheduler started successfully');
  }

  /**
   * Stop the daily update scheduler
   */
  stopDailyUpdateScheduler(): void {
    if (this.dailyUpdateTask) {
      this.dailyUpdateTask.stop();
      this.dailyUpdateTask = null;
      console.log('Daily update scheduler stopped');
    } else {
      console.log('Daily update scheduler is not running');
    }
  }

  /**
   * Check if scheduler is currently running
   */
  isSchedulerRunning(): boolean {
    return this.dailyUpdateTask !== null;
  }

  /**
   * Process daily updates for all users with batch processing and error handling
   */
  async processDailyUpdatesForAllUsers(): Promise<void> {
    if (this.isRunning) {
      console.log('Daily update process is already running');
      return;
    }

    this.isRunning = true;
    const stats: SchedulerStats = {
      totalUsers: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      skippedUpdates: 0,
      startTime: new Date(),
      errors: []
    };

    try {
      console.log('Starting daily update process for all users');

      // Get all users with notification settings enabled
      const users = await this.getEligibleUsers();
      stats.totalUsers = users.length;

      console.log(`Found ${users.length} eligible users for daily updates`);

      if (users.length === 0) {
        console.log('No eligible users found for daily updates');
        return;
      }

      // Process users in batches to avoid overwhelming the system
      for (let i = 0; i < users.length; i += this.batchSize) {
        const batch = users.slice(i, i + this.batchSize);
        console.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(users.length / this.batchSize)} (${batch.length} users)`);

        // Process batch concurrently
        const batchPromises = batch.map(async (user) => {
          try {
            await this.processDailyUpdateForUser(user.id);
            stats.successfulUpdates++;
            console.log(`✓ Daily update completed for user ${user.id} (${user.email})`);
          } catch (error: any) {
            stats.failedUpdates++;
            const errorInfo = {
              userId: user.id,
              error: error.message || 'Unknown error',
              timestamp: new Date()
            };
            stats.errors.push(errorInfo);
            console.error(`✗ Daily update failed for user ${user.id} (${user.email}):`, error.message);
          }
        });

        await Promise.all(batchPromises);

        // Add delay between batches to prevent rate limiting
        if (i + this.batchSize < users.length) {
          console.log(`Waiting ${this.batchDelay}ms before processing next batch...`);
          await this.delay(this.batchDelay);
        }
      }

      stats.endTime = new Date();
      stats.duration = stats.endTime.getTime() - stats.startTime.getTime();

      // Log final statistics
      console.log('Daily update process completed:', {
        totalUsers: stats.totalUsers,
        successful: stats.successfulUpdates,
        failed: stats.failedUpdates,
        skipped: stats.skippedUpdates,
        duration: `${Math.round(stats.duration / 1000)}s`,
        errorRate: `${((stats.failedUpdates / stats.totalUsers) * 100).toFixed(1)}%`
      });

      // Log errors if any
      if (stats.errors.length > 0) {
        console.error('Errors during daily update process:');
        stats.errors.forEach(error => {
          console.error(`- User ${error.userId}: ${error.error}`);
        });
      }

      // Save scheduler run statistics (optional - could be stored in database)
      await this.saveSchedulerStats(stats);

    } catch (error: any) {
      console.error('Critical error in daily update process:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process daily update for a specific user with retry logic
   */
  async processDailyUpdateForUser(userId: string): Promise<void> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // Check if user should receive updates today
        const shouldSendUpdate = await this.shouldSendDailyUpdate(userId);
        if (!shouldSendUpdate) {
          console.log(`Skipping daily update for user ${userId} (weekends disabled or already sent)`);
          return;
        }

        // Generate daily report
        const report = await notificationService.generateDailyReport(userId);

        // Send daily update email
        await notificationService.sendDailyUpdate(userId, report);

        console.log(`Daily update sent successfully to user ${userId} (attempt ${attempt})`);
        return; // Success

      } catch (error: any) {
        lastError = error;
        console.warn(`Daily update attempt ${attempt} failed for user ${userId}:`, error.message);

        // Don't retry on certain types of errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < this.retryAttempts) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    throw new Error(`Failed to process daily update for user ${userId} after ${this.retryAttempts} attempts: ${lastError.message}`);
  }

  /**
   * Get users eligible for daily updates
   */
  private async getEligibleUsers(): Promise<User[]> {
    try {
      const users = await prisma.user.findMany({
        where: {
          notificationSettings: {
            emailEnabled: true,
            dailyUpdateEnabled: true
          },
          // Only include users with at least one stock position
          stockPositions: {
            some: {}
          }
        },
        include: {
          notificationSettings: true
        }
      });

      // Filter users based on weekend settings
      const today = new Date();
      const isWeekend = today.getDay() === 0 || today.getDay() === 6; // Sunday = 0, Saturday = 6

      if (isWeekend) {
        return users.filter(user => 
          user.notificationSettings?.weekendsEnabled === true
        );
      }

      return users;
    } catch (error) {
      console.error('Failed to get eligible users:', error);
      throw error;
    }
  }

  /**
   * Check if daily update should be sent to user today
   */
  private async shouldSendDailyUpdate(userId: string): Promise<boolean> {
    try {
      const today = new Date();
      const todayDateString = today.toDateString();

      // Check if report was already sent today
      const existingReport = await prisma.dailyReport.findUnique({
        where: {
          userId_reportDate: {
            userId,
            reportDate: new Date(todayDateString)
          }
        }
      });

      // Don't send if already sent today
      if (existingReport?.emailSent) {
        return false;
      }

      // Check user's notification settings
      const settings = await notificationService.getNotificationSettings(userId);
      
      // Check if user has disabled email or daily updates
      if (!settings.emailEnabled || !settings.dailyUpdateEnabled) {
        return false;
      }

      // Check weekend settings
      const isWeekend = today.getDay() === 0 || today.getDay() === 6;
      if (isWeekend && !settings.weekendsEnabled) {
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Failed to check if daily update should be sent for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Check if error is non-retryable (e.g., user not found, invalid email)
   */
  private isNonRetryableError(error: any): boolean {
    const nonRetryableMessages = [
      'User',
      'not found',
      'Invalid email',
      'Email disabled',
      'Daily updates disabled'
    ];

    const errorMessage = error.message || '';
    return nonRetryableMessages.some(msg => 
      errorMessage.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Save scheduler statistics (could be extended to store in database)
   */
  private async saveSchedulerStats(stats: SchedulerStats): Promise<void> {
    try {
      // For now, just log the stats. In production, you might want to store these in a database
      const logEntry = {
        timestamp: stats.startTime.toISOString(),
        duration: stats.duration,
        totalUsers: stats.totalUsers,
        successful: stats.successfulUpdates,
        failed: stats.failedUpdates,
        skipped: stats.skippedUpdates,
        errorRate: ((stats.failedUpdates / stats.totalUsers) * 100).toFixed(1) + '%',
        errors: stats.errors.length
      };

      console.log('Scheduler run statistics:', JSON.stringify(logEntry, null, 2));

      // Optional: Store in database for monitoring and analytics
      // await prisma.schedulerRun.create({ data: logEntry });

    } catch (error) {
      console.error('Failed to save scheduler stats:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual trigger for daily updates (useful for testing or manual runs)
   */
  async triggerManualDailyUpdate(): Promise<SchedulerStats> {
    console.log('Manually triggering daily update process');
    
    const startTime = new Date();
    await this.processDailyUpdatesForAllUsers();
    
    return {
      totalUsers: 0, // Will be populated by processDailyUpdatesForAllUsers
      successfulUpdates: 0,
      failedUpdates: 0,
      skippedUpdates: 0,
      startTime,
      endTime: new Date(),
      errors: []
    };
  }

  /**
   * Get scheduler status information
   */
  getSchedulerStatus(): {
    isRunning: boolean;
    isProcessing: boolean;
    cronExpression: string;
    timezone: string;
  } {
    return {
      isRunning: this.isSchedulerRunning(),
      isProcessing: this.isRunning,
      cronExpression: this.cronExpression,
      timezone: process.env.SCHEDULER_TIMEZONE || 'America/New_York'
    };
  }
}

export const schedulerService = new SchedulerService();