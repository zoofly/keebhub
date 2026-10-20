import React from 'react';
import { Button, CircularProgress } from '@material-ui/core';
import './StatusMessage.css';

// One place for loading, error, and empty states so every page
// looks and announces them the same way.
//   variant: 'loading' | 'error' | 'empty'
function StatusMessage({ variant = 'empty', title, children, onRetry, action }) {
  if (variant === 'loading') {
    return (
      <div className="status-message" role="status">
        <CircularProgress size={32} aria-hidden="true" />
        <p className="status-message__text">{children || 'Loading…'}</p>
      </div>
    );
  }

  const isError = variant === 'error';

  return (
    <div
      className={`status-message ${isError ? 'status-message_error' : ''}`}
      role={isError ? 'alert' : undefined}
    >
      {title && <p className="status-message__title">{title}</p>}
      {children && <p className="status-message__text">{children}</p>}
      {(onRetry || action) && (
        <div className="status-message__actions">
          {onRetry && (
            <Button variant="outlined" color="primary" onClick={onRetry}>
              Try again
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export default StatusMessage;
