import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '@material-ui/core';
import ListingsGrid from '../ListingsGrid/ListingsGrid';
import StatusMessage from '../StatusMessage/StatusMessage';
import useDocumentTitle from '../../hooks/useDocumentTitle';

function MyListings() {
  useDocumentTitle('My listings');
  const dispatch = useDispatch();
  const myListings = useSelector((store) => store.myListings);
  const status = useSelector((store) => store.status.myListings);
  const user = useSelector((store) => store.user);

  const loadListings = () => dispatch({ type: 'GET_MY_LISTINGS' });

  useEffect(() => {
    dispatch({ type: 'GET_MY_LISTINGS' });
  }, [dispatch]);

  let content;
  if (status.loading && myListings.length === 0) {
    content = (
      <StatusMessage variant="loading">Loading your listings…</StatusMessage>
    );
  } else if (status.error && myListings.length === 0) {
    content = (
      <StatusMessage
        variant="error"
        title="Your listings didn't load"
        onRetry={loadListings}
      >
        {status.error}
      </StatusMessage>
    );
  } else if (myListings.length === 0) {
    content = (
      <StatusMessage
        title="You haven't listed anything yet"
        action={
          <Button component={Link} to="/create" variant="contained" color="primary">
            Create a listing
          </Button>
        }
      >
        Listings you create will show up here so you can edit or remove them.
      </StatusMessage>
    );
  } else {
    content = <ListingsGrid listings={myListings} currentUserId={user.id} />;
  }

  const hasCount = !status.loading || myListings.length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My listings</h1>
          {hasCount && !status.error && (
            <p className="page-lede">
              {myListings.length === 1
                ? 'You have 1 listing on the market.'
                : `You have ${myListings.length} listings on the market.`}
            </p>
          )}
        </div>
        <Button
          component={Link}
          to="/create"
          variant="contained"
          color="primary"
          size="large"
        >
          Create a listing
        </Button>
      </div>
      {content}
    </div>
  );
}
export default MyListings;
