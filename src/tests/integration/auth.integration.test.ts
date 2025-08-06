import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authRoutes from '../../routes/auth';
import { testDb, testPrisma } from './testDatabase';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    await testDb.setupTestDatabase();
  });

  afterAll(async () => {
    await testDb.teardownTestDatabase();
  });

  beforeEach(async () => {
    await testDb.cleanupTestDatabase();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      email: 'integration@example.com',
      password: 'TestPassword123!',
      firstName: 'Integration',
      lastName: 'Test'
    };

    it('should register a new user and store in database', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(validRegistrationData.email);
      expect(response.body.data.token).toBeDefined();

      // Verify user was created in database
      const userInDb = await testPrisma.user.findUnique({
        where: { email: validRegistrationData.email },
        include: { notificationSettings: true }
      });

      expect(userInDb).toBeTruthy();
      expect(userInDb?.firstName).toBe(validRegistrationData.firstName);
      expect(userInDb?.lastName).toBe(validRegistrationData.lastName);
      expect(userInDb?.notificationSettings).toBeTruthy();

      // Verify password was hashed
      const isPasswordValid = await bcrypt.compare(
        validRegistrationData.password,
        userInDb!.passwordHash
      );
      expect(isPasswordValid).toBe(true);
    });

    it('should prevent duplicate email registration', async () => {
      // Create user first
      await testDb.createTestUser({
        email: validRegistrationData.email
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');

      // Verify only one user exists
      const usersCount = await testPrisma.user.count({
        where: { email: validRegistrationData.email }
      });
      expect(usersCount).toBe(1);
    });

    it('should validate email format', async () => {
      const invalidData = {
        ...validRegistrationData,
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');

      // Verify no user was created
      const userCount = await testPrisma.user.count();
      expect(userCount).toBe(0);
    });

    it('should validate password strength', async () => {
      const weakPasswordData = {
        ...validRegistrationData,
        password: 'weak'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');

      // Verify no user was created
      const userCount = await testPrisma.user.count();
      expect(userCount).toBe(0);
    });

    it('should create default notification settings', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData)
        .expect(201);

      const userId = response.body.data.user.id;
      const notificationSettings = await testPrisma.notificationSettings.findUnique({
        where: { userId }
      });

      expect(notificationSettings).toBeTruthy();
      expect(notificationSettings?.emailEnabled).toBe(true);
      expect(notificationSettings?.dailyUpdateEnabled).toBe(true);
      expect(notificationSettings?.updateTime).toBe('09:00');
      expect(notificationSettings?.alertThreshold).toBe(5.0);
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser: any;
    const testPassword = 'TestPassword123!';

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      testUser = await testDb.createTestUser({
        email: 'login-test@example.com',
        passwordHash: hashedPassword
      });
    });

    it('should login with valid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: testPassword
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(testUser.id);
      expect(response.body.data.token).toBeDefined();

      // Verify JWT token is valid
      const decoded = jwt.verify(
        response.body.data.token,
        process.env.JWT_SECRET || 'test-jwt-secret'
      ) as any;
      expect(decoded.userId).toBe(testUser.id);
    });

    it('should reject invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: testPassword
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    it('should reject invalid password', async () => {
      const loginData = {
        email: testUser.email,
        password: 'WrongPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    it('should validate input format', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: testPassword
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/auth/me', () => {
    let testUser: any;
    let authToken: string;

    beforeEach(async () => {
      testUser = await testDb.createTestUser();
      authToken = jwt.sign(
        { userId: testUser.id },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });

    it('should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testUser.id);
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body.data.passwordHash).toBeUndefined(); // Should not expose password
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('token required');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    it('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: testUser.id },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('expired');
    });

    it('should reject token for non-existent user', async () => {
      const nonExistentToken = jwt.sign(
        { userId: 'non-existent-user-id' },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '24h' }
      );

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${nonExistentToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('User not found');
    });
  });

  describe('POST /api/auth/verify', () => {
    let testUser: any;
    let validToken: string;

    beforeEach(async () => {
      testUser = await testDb.createTestUser();
      validToken = jwt.sign(
        { userId: testUser.id },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });

    it('should verify valid token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: validToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.user.id).toBe(testUser.id);
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: 'invalid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.data.valid).toBe(false);
    });

    it('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: testUser.id },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: expiredToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.data.valid).toBe(false);
    });

    it('should require token in request body', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should rollback user creation on notification settings failure', async () => {
      // This test simulates a scenario where user creation succeeds but
      // notification settings creation fails, ensuring proper rollback
      
      const registrationData = {
        email: 'rollback-test@example.com',
        password: 'TestPassword123!',
        firstName: 'Rollback',
        lastName: 'Test'
      };

      // Mock a database constraint violation for notification settings
      const originalCreate = testPrisma.notificationSettings.create;
      testPrisma.notificationSettings.create = jest.fn().mockRejectedValue(
        new Error('Constraint violation')
      );

      try {
        await request(app)
          .post('/api/auth/register')
          .send(registrationData)
          .expect(500);

        // Verify user was not created due to transaction rollback
        const userCount = await testPrisma.user.count({
          where: { email: registrationData.email }
        });
        expect(userCount).toBe(0);

      } finally {
        // Restore original method
        testPrisma.notificationSettings.create = originalCreate;
      }
    });

    it('should handle concurrent registration attempts', async () => {
      const registrationData = {
        email: 'concurrent-test@example.com',
        password: 'TestPassword123!',
        firstName: 'Concurrent',
        lastName: 'Test'
      };

      // Attempt concurrent registrations
      const promises = Array(3).fill(null).map(() =>
        request(app)
          .post('/api/auth/register')
          .send(registrationData)
      );

      const results = await Promise.allSettled(promises);

      // Only one should succeed
      const successful = results.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status === 201
      );
      const failed = results.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status !== 201
      );

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(2);

      // Verify only one user exists
      const userCount = await testPrisma.user.count({
        where: { email: registrationData.email }
      });
      expect(userCount).toBe(1);
    });
  });
});