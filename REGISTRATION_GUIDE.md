# Portfolio Tracker - Registration Guide

## Registration Requirements

The Portfolio Tracker application has specific validation requirements for user registration to ensure security and data integrity.

### Password Requirements

Your password must meet ALL of the following criteria:

- **Minimum 8 characters** (not 6)
- **At least one lowercase letter** (a-z)
- **At least one uppercase letter** (A-Z)
- **At least one number** (0-9)
- **At least one special character** from: `@$!%*?&`
- **Maximum 128 characters**

**Examples of valid passwords:**
- `SecurePass123!`
- `MyPassword2024@`
- `StrongPwd456$`

**Examples of invalid passwords:**
- `password123` (missing uppercase and special character)
- `PASSWORD123!` (missing lowercase)
- `MyPassword!` (missing number)
- `MyPass123` (missing special character)
- `Short1!` (less than 8 characters)

### Name Requirements

**First Name and Last Name** must:
- **Be between 1 and 50 characters**
- **Only contain letters, spaces, hyphens, and apostrophes**
- **No numbers or other special characters**

**Examples of valid names:**
- `John`
- `Mary-Jane`
- `O'Connor`
- `Jean Pierre`

**Examples of invalid names:**
- `John123` (contains numbers)
- `Mary@Jane` (contains invalid special character)
- `User2` (contains numbers)

### Email Requirements

- Must be a valid email format
- Example: `user@example.com`

## Troubleshooting Registration Issues

### "Registration failed. Please try again."

This error typically occurs when:

1. **Password doesn't meet requirements** - Check that your password includes uppercase, lowercase, numbers, and special characters
2. **Name contains invalid characters** - Make sure names only contain letters, spaces, hyphens, and apostrophes
3. **Email already exists** - Try using a different email address
4. **Network connectivity issues** - Check your internet connection

### Frontend Validation

The registration form now provides real-time validation feedback:

- **Password field** shows requirements as helper text
- **Name fields** validate character restrictions
- **Email field** checks for proper email format
- **Confirm password** ensures passwords match

### Backend Validation

The server performs additional security validation:

- Checks for common weak passwords
- Sanitizes input to prevent XSS attacks
- Validates email format server-side
- Ensures password complexity requirements

## Getting Help

If you continue to experience registration issues:

1. **Check the browser console** for detailed error messages
2. **Verify all requirements** are met using the examples above
3. **Try a different email address** if you get "email already exists" errors
4. **Clear browser cache** and try again

## Example Registration Data

Here's an example of valid registration data:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}
```

This will successfully create a new user account in the Portfolio Tracker application.