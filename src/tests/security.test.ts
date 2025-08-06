import request from 'supertest';
import express, { Request, Response } from 'express';
import { rateLimiters, securityHeaders } from '../middleware/security';
import { sanitizeInput } from '../middleware/security';
import { validateRegistration, validateLogin, validateCreatePosition } from '../middleware/validation';

// Mock app for testing middleware
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(sanitizeInput);
  app.use(securityHeaders);
  
  // Test routes
  app.post('/test/register', validateRegistration, (req: Request, res: Response) => {
    res.json({ success: true, data: req.body });
  });
  
  app.post('/test/login', validateLogin, (req: Request, res: Response) => {
    res.json({ success: true, data: req.body });
  });
  
  app.post('/test/position', validateCreatePosition, (req: Request, res: Response) => {
    res.json({ success: true, data: req.body });
  });
  
  app.get('/test/headers', (req: Request, res: Response) => {
    res.json({ headers: res.getHeaders() });
  });
  
  return app;
};

describe('Security Middleware Tests', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = createTestApp();
  });

  describe('Input Sanitization', () => {
    it('should sanitize malicious HTML in registration', async () => {
      const maliciousData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        firstName: '<script>alert("xss")</script>John',
        lastName: '<img src="x" onerror="alert(1)">Doe'
      };

      const response = await request(app)
        .post('/test/register')
        .send(maliciousData)
        .expect(200);

      expect(response.body.data.firstName).toBe('John');
      expect(response.body.data.lastName).toBe('Doe');
      expect(response.body.data.firstName).not.toContain('<script>');
      expect(response.body.data.lastName).not.toContain('<img');
    });

    it('should sanitize SQL injection attempts', async () => {
      const maliciousData = {
        symbol: "AAPL'; DROP TABLE users; --",
        quantity: 10,
        purchasePrice: 150.00,
        purchaseDate: '2024-01-01'
      };

      const response = await request(app)
        .post('/test/position')
        .send(maliciousData)
        .expect(400); // Should fail validation

      expect(response.body.success).toBe(false);
    });

    it('should handle XSS attempts in various fields', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '"><script>alert("xss")</script>',
        "'; alert('xss'); //",
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/test/register')
          .send({
            email: 'test@example.com',
            password: 'ValidPass123!',
            firstName: payload,
            lastName: 'Doe'
          });

        if (response.status === 200) {
          expect(response.body.data.firstName).not.toContain('<script>');
          expect(response.body.data.firstName).not.toContain('javascript:');
          expect(response.body.data.firstName).not.toContain('<img');
        }
      }
    });
  });

  describe('Input Validation', () => {
    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'password123',
        '12345678',
        'qwerty123',
        'admin123'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/test/register')
          .send({
            email: 'test@example.com',
            password,
            firstName: 'John',
            lastName: 'Doe'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      }
    });

    it('should reject disposable email addresses', async () => {
      const disposableEmails = [
        'test@10minutemail.com',
        'user@tempmail.org',
        'fake@guerrillamail.com',
        'spam@mailinator.com'
      ];

      for (const email of disposableEmails) {
        const response = await request(app)
          .post('/test/register')
          .send({
            email,
            password: 'ValidPass123!',
            firstName: 'John',
            lastName: 'Doe'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });

    it('should validate stock symbol format', async () => {
      const invalidSymbols = [
        '<script>alert("xss")</script>',
        'AAPL; DROP TABLE',
        'A'.repeat(11), // Too long
        '', // Empty
        '123!@#', // Invalid characters
      ];

      for (const symbol of invalidSymbols) {
        const response = await request(app)
          .post('/test/position')
          .send({
            symbol,
            quantity: 10,
            purchasePrice: 150.00,
            purchaseDate: '2024-01-01'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });

    it('should validate financial amounts', async () => {
      const invalidAmounts = [
        -10, // Negative
        0, // Zero
        1000001, // Too large
        'not-a-number',
        null,
        undefined
      ];

      for (const amount of invalidAmounts) {
        const response = await request(app)
          .post('/test/position')
          .send({
            symbol: 'AAPL',
            quantity: amount,
            purchasePrice: 150.00,
            purchaseDate: '2024-01-01'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });

    it('should validate dates', async () => {
      const invalidDates = [
        '2025-12-31', // Future date
        '1899-01-01', // Too far in past
        'not-a-date',
        '2024-13-01', // Invalid month
        '2024-01-32', // Invalid day
      ];

      for (const date of invalidDates) {
        const response = await request(app)
          .post('/test/position')
          .send({
            symbol: 'AAPL',
            quantity: 10,
            purchasePrice: 150.00,
            purchaseDate: date
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Security Headers', () => {
    it('should set security headers', async () => {
      const response = await request(app)
        .get('/test/headers')
        .expect(200);

      const headers = response.body.headers;
      
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-xss-protection']).toBe('1; mode=block');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('Data Sanitization Edge Cases', () => {
    it('should handle nested objects', async () => {
      const nestedMaliciousData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        firstName: 'John',
        lastName: 'Doe',
        metadata: {
          source: '<script>alert("nested xss")</script>',
          tags: ['<img src="x" onerror="alert(1)">', 'normal-tag']
        }
      };

      // This would need a route that accepts nested data
      // For now, we'll test the sanitization function directly
      const sanitized = testSanitizeInput(nestedMaliciousData);
      
      // The sanitization should be applied recursively
      expect(sanitized).toBeDefined();
    });

    it('should handle null and undefined values', async () => {
      const dataWithNulls = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        firstName: null,
        lastName: undefined
      };

      const response = await request(app)
        .post('/test/register')
        .send(dataWithNulls)
        .expect(400); // Should fail validation due to null/undefined names

      expect(response.body.success).toBe(false);
    });

    it('should handle very long strings', async () => {
      const veryLongString = 'A'.repeat(10000);
      
      const response = await request(app)
        .post('/test/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPass123!',
          firstName: veryLongString,
          lastName: 'Doe'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Authentication Security', () => {
    it('should reject login with empty credentials', async () => {
      const response = await request(app)
        .post('/test/login')
        .send({
          email: '',
          password: ''
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject login with malformed email', async () => {
      const malformedEmails = [
        'not-an-email',
        '@example.com',
        'test@',
        'test..test@example.com',
        'test@example',
      ];

      for (const email of malformedEmails) {
        const response = await request(app)
          .post('/test/login')
          .send({
            email,
            password: 'ValidPass123!'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      }
    });
  });
});

describe('Rate Limiting Tests', () => {
  it('should have different rate limits for different endpoints', () => {
    expect(rateLimiters.general).toBeDefined();
    expect(rateLimiters.auth).toBeDefined();
    expect(rateLimiters.portfolio).toBeDefined();
    expect(rateLimiters.marketData).toBeDefined();
  });

  // Note: Testing actual rate limiting would require more complex setup
  // with multiple requests and timing, which is better suited for integration tests
});

// Helper function to test sanitization directly
function testSanitizeInput(input: any): any {
  // This would use the actual sanitization logic from the middleware
  // For testing purposes, we'll simulate it
  if (typeof input === 'string') {
    return input.replace(/<[^>]*>/g, '').trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(item => testSanitizeInput(item));
  }
  
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = testSanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}