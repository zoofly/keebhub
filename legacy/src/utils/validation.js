// Client-side checks that mirror the server's validation rules.
// The server is still the source of truth; these just give faster,
// friendlier feedback before a request is sent.

export const LIMITS = {
  titleMax: 200,
  descriptionMax: 5000,
  usernameMax: 80,
  passwordMin: 8,
  passwordMaxBytes: 72,
  priceMax: 99999999.99, // postings.price is NUMERIC(10, 2)
};

// True only for absolute http:// or https:// URLs
export const isHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const byteLength = (value) => new TextEncoder().encode(value).length;

// Returns an object of field -> message. Empty object means valid.
export const validatePosting = ({ title, description, image, price }) => {
  const errors = {};

  if (!title.trim()) {
    errors.title = 'Give your listing a title.';
  } else if (title.trim().length > LIMITS.titleMax) {
    errors.title = `Keep the title to ${LIMITS.titleMax} characters or fewer.`;
  }

  if (description.trim().length > LIMITS.descriptionMax) {
    errors.description = `Keep the description to ${LIMITS.descriptionMax} characters or fewer.`;
  }

  if (!image.trim()) {
    errors.image = 'Add a link to a photo of the item.';
  } else if (!isHttpUrl(image)) {
    errors.image = 'Use a full web address that starts with http:// or https://';
  }

  const priceText = String(price).trim();
  const priceNumber = Number(priceText);
  if (!priceText) {
    errors.price = 'Enter a price (use 0 for free or trade).';
  } else if (!Number.isFinite(priceNumber)) {
    errors.price = 'Price must be a number, like 45 or 45.50.';
  } else if (priceNumber < 0) {
    errors.price = 'Price cannot be negative.';
  } else if (priceNumber > LIMITS.priceMax) {
    errors.price = 'Price must be under $100,000,000.';
  }

  return errors;
};

// Shapes form values into the JSON body the server expects
export const toPostingPayload = ({ title, description, image, price }) => ({
  title: title.trim(),
  description: description.trim(),
  image: image.trim(),
  price: Number(String(price).trim()),
});

export const validateRegistration = ({ username, password }) => {
  const errors = {};

  if (!username.trim()) {
    errors.username = 'Choose a username.';
  } else if (username.trim().length > LIMITS.usernameMax) {
    errors.username = `Usernames can be at most ${LIMITS.usernameMax} characters.`;
  }

  if (password.length < LIMITS.passwordMin) {
    errors.password = `Passwords need at least ${LIMITS.passwordMin} characters.`;
  } else if (byteLength(password) > LIMITS.passwordMaxBytes) {
    errors.password = `That password is too long. Use at most ${LIMITS.passwordMaxBytes} characters (fewer if it has emoji or accented letters).`;
  }

  return errors;
};

export const formatPrice = (price) => {
  const value = Number(price);
  if (!Number.isFinite(value)) {
    return '';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};
