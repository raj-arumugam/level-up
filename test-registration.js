// Simple test script to verify registration is working
const axios = require('axios');

async function testRegistration() {
  try {
    console.log('Testing registration...');
    
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User'
    };
    
    console.log('Sending registration request with:', {
      email: testUser.email,
      firstName: testUser.firstName,
      lastName: testUser.lastName
    });
    
    const response = await axios.post('http://localhost:3001/api/auth/register', testUser, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    console.log('Registration successful!');
    console.log('Response status:', response.status);
    console.log('Response data structure:', {
      success: response.data.success,
      hasData: !!response.data.data,
      hasUser: !!response.data.data?.user,
      hasToken: !!response.data.data?.token,
      message: response.data.message
    });
    
    // Test login with the same user
    console.log('\nTesting login...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: testUser.email,
      password: testUser.password
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      }
    });
    
    console.log('Login successful!');
    console.log('Login response structure:', {
      success: loginResponse.data.success,
      hasData: !!loginResponse.data.data,
      hasUser: !!loginResponse.data.data?.user,
      hasToken: !!loginResponse.data.data?.token,
      message: loginResponse.data.message
    });
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

testRegistration();