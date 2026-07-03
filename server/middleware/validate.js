const validator = require('validator');

function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return validator.escape(str.trim());
}

function validateEmail(email) {
  return validator.isEmail(email);
}

function validatePhone(phone) {
  return /^[\d\s\-\+\(\)]{7,20}$/.test(phone);
}

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('Minimum 8 characters required');
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter required');
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter required');
  if (!/[0-9]/.test(password)) errors.push('At least one number required');
  return errors;
}

function validateSignupBody(body) {
  const errors = {};
  const { name, email, phone, password, confirmPassword } = body;

  if (!name || !name.trim()) errors.name = 'Full name is required';
  if (!email || !email.trim()) errors.email = 'Email is required';
  else if (!validateEmail(email)) errors.email = 'Invalid email format';
  if (!phone || !phone.trim()) errors.phone = 'Phone number is required';
  else if (!validatePhone(phone)) errors.phone = 'Invalid phone number format';
  if (!password) errors.password = 'Password is required';
  else {
    const pwdErrors = validatePassword(password);
    if (pwdErrors.length) errors.password = pwdErrors.join('. ');
  }
  if (confirmPassword !== undefined && password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      name: sanitizeInput(name),
      email: email ? email.toLowerCase().trim() : '',
      phone: sanitizeInput(phone),
      password
    }
  };
}

function validateLoginBody(body) {
  const errors = {};
  const { email, phone, password } = body;

  if (!email && !phone) errors.identifier = 'Email or phone number is required';
  if (email && !validateEmail(email)) errors.email = 'Invalid email format';
  if (!password) errors.password = 'Password is required';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    identifier: email ? email.toLowerCase().trim() : sanitizeInput(phone)
  };
}

function sanitizeObject(obj) {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

module.exports = {
  sanitizeInput,
  validateEmail,
  validatePhone,
  validatePassword,
  validateSignupBody,
  validateLoginBody,
  sanitizeObject
};
