const password = 'Test@123';
const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/;

console.log('Password:', password);
console.log('Length:', password.length);
console.log('Has lowercase:', /[a-z]/.test(password));
console.log('Has uppercase:', /[A-Z]/.test(password));
console.log('Has number:', /\d/.test(password));
console.log('Has special char:', /[@$!%*?&]/.test(password));
console.log('Meets all requirements:', regex.test(password));
console.log('Min 8 chars:', password.length >= 8);