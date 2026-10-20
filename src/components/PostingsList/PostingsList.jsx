import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '@material-ui/core';
import ListingsGrid from '../ListingsGrid/ListingsGrid';
import StatusMessage from '../StatusMessage/StatusMessage';

function PostingsList() {
  const dispatch = useDispatch();
  const postings = useSelector((store) => store.postings);
  const status = useSelector((store) => store.status.postings);
  const user = useSelector((store) => store.user);

  const loadListings = () => dispatch({ type: 'GET_LISTINGS' });

  useEffect(() => {
    dispatch({ type: 'GET_LISTINGS' });
  }, [dispatch]);

  // Keep showing existing cards during a background refresh
  if (status.loading && postings.length === 0) {
    return <StatusMessage variant="loading">Loading listings…</StatusMessage>;
  }

  if (status.error && postings.length === 0) {
    return (
      <StatusMessage
        variant="error"
        title="Listings didn't load"
        onRetry={loadListings}
      >
        {status.error}
      </StatusMessage>
    );
  }

  if (postings.length === 0) {
    return (
      <StatusMessage
        title="No listings yet"
        action={
          <Button component={Link} to="/create" variant="contained" color="primary">
            Create the first listing
          </Button>
        }
      >
        Be the first to post a keyboard, switches, or keycaps.
      </StatusMessage>
    );
  }

  return <ListingsGrid listings={postings} currentUserId={user.id} />;
}

export default PostingsList;
