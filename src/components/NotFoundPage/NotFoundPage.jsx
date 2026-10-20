import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@material-ui/core';
import useDocumentTitle from '../../hooks/useDocumentTitle';

function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="page page_narrow">
      <h1>Page not found</h1>
      <p className="page-lede">
        We couldn't find that page. It may have moved, or the link might be
        mistyped.
      </p>
      <p>
        <Button component={Link} to="/home" variant="contained" color="primary">
          Go to the home page
        </Button>
      </p>
    </div>
  );
}

export default NotFoundPage;
