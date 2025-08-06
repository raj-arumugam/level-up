import { schedulerService } from '../services/schedulerService';

// Mock dependencies
jest.mock('../lib/database');
jest.mock('../services/notificationService');
jest.mock('node-cron');
jest.mock('../lib/logger');

describe('Scheduler Basic Functionality', () => {
  it('should have all required methods', () => {
    expect(schedulerService.startDailyUpdateScheduler).toBeDefined();
    expect(schedulerService.stopDailyUpdateScheduler).toBeDefined();
    expect(schedulerService.processDailyUpdatesForAllUsers).toBeDefined();
    expect(schedulerService.processDailyUpdateForUser).toBeDefined();
    expect(schedulerService.isSchedulerRunning).toBeDefined();
    expect(schedulerService.getSchedulerStatus).toBeDefined();
    expect(schedulerService.triggerManualDailyUpdate).toBeDefined();
  });

  it('should return scheduler status', () => {
    const status = schedulerService.getSchedulerStatus();
    
    expect(status).toHaveProperty('isRunning');
    expect(status).toHaveProperty('isProcessing');
    expect(status).toHaveProperty('cronExpression');
    expect(status).toHaveProperty('timezone');
  });

  it('should track running state correctly', () => {
    expect(schedulerService.isSchedulerRunning()).toBe(false);
  });
});