// Turns an axios error into a message that makes sense to the person
// using the app. Never includes request bodies or headers.

const statusOf = (error) => (error && error.response ? error.response.status : 0);

export const listingErrorMessage = (error) => {
  switch (statusOf(error)) {
    case 400:
      return 'The server could not accept that listing. Check that it has a title (up to 200 characters), a description under 5000 characters, a price of 0 or more, and an image link starting with http:// or https://.';
    case 401:
    case 403:
      return 'Your session has ended. Please log in again.';
    case 404:
      return 'That listing could not be found. It may have been removed, or it belongs to someone else.';
    case 0:
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong on our end. Please try again in a moment.';
  }
};

export const loadErrorMessage = (error, what) => {
  switch (statusOf(error)) {
    case 401:
    case 403:
      return 'Your session has ended. Please log in again.';
    case 0:
      return `Could not load ${what}. Check your connection and try again.`;
    default:
      return `Could not load ${what} right now. Please try again.`;
  }
};

export { statusOf };
